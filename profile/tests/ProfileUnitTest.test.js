process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret';

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  console.error.mockRestore();
});

/* ══════════════════════════════════════════════════════════
   MOCKS
══════════════════════════════════════════════════════════ */

const mockExecute = jest.fn();
jest.mock('mysql2/promise', () => ({
  createPool: () => ({ execute: mockExecute }),
}));

const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

const jwt = require('jsonwebtoken');
const request = require('supertest');

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */

const makeToken = (payload = { userId: 1, username: 'testuser' }) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });

const authHeader = () => ({ Authorization: `Bearer ${makeToken()}` });

// Helper to mock a fetch response
const mockFetchResponse = (data, ok = true) =>
  Promise.resolve({
    ok,
    json: () => Promise.resolve(data),
  });

const mockUser = {
  id: 2,
  first_name: 'Jane',
  last_name: 'Doe',
  username: 'janedoe',
  bio: 'Hello',
  profile_image_url: null,
  is_private: 0,
  created_at: new Date(),
};

/* ══════════════════════════════════════════════════════════
   ProfileModel
══════════════════════════════════════════════════════════ */

const { searchUsers, getUserInfo } = require('../ProfileModel');

describe('ProfileModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── isBlocked helper (tested via searchUsers/getUserInfo) ─

  // ─── getFollowersCount ──────────────────────────────────
  describe('getFollowersCount (via getUserInfo)', () => {
    it('should return 0 if count is missing from response', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      // isBlocked → not blocked
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        // getFollowersCount → missing count field
        .mockResolvedValueOnce(mockFetchResponse({}))
        // getFollowingCount
        .mockResolvedValueOnce(mockFetchResponse({ count: 5 }))
        // getIsFollowing
        .mockResolvedValueOnce(mockFetchResponse({ isFollowing: false }));

      const result = await getUserInfo(2, 1);
      expect(result.data.followers_count).toBe(0);
    });
  });

  // ─── getFollowingCount ──────────────────────────────────
  describe('getFollowingCount (via getUserInfo)', () => {
    it('should return 0 if count is missing from response', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 3 }))
        // getFollowingCount → missing count field
        .mockResolvedValueOnce(mockFetchResponse({}))
        .mockResolvedValueOnce(mockFetchResponse({ isFollowing: false }));

      const result = await getUserInfo(2, 1);
      expect(result.data.following_count).toBe(0);
    });
  });

  // ─── searchUsers ────────────────────────────────────────
  describe('searchUsers', () => {
    it('should return users that are not blocked', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockResolvedValueOnce(mockFetchResponse({ blocked: false }));

      const result = await searchUsers('jane', 1);
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('janedoe');
    });

    it('should filter out blocked users', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockResolvedValueOnce(mockFetchResponse({ blocked: true }));

      const result = await searchUsers('jane', 1);
      expect(result).toHaveLength(0);
    });

    it('should return empty array if no users match query', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      const result = await searchUsers('xyz', 1);
      expect(result).toHaveLength(0);
    });

    it('should handle multiple users and filter blocked ones', async () => {
      const user2 = { ...mockUser, id: 3, username: 'janeb' };
      mockExecute.mockResolvedValueOnce([[mockUser, user2]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ blocked: true }));

      const result = await searchUsers('jane', 1);
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('janedoe');
    });

    it('should throw if database fails', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(searchUsers('jane', 1)).rejects.toThrow('DB error');
    });

    it('should throw if fetch fails', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockRejectedValue(new Error('Fetch error'));
      await expect(searchUsers('jane', 1)).rejects.toThrow('Fetch error');
    });
  });

  // ─── getUserInfo ────────────────────────────────────────
  describe('getUserInfo', () => {
    it('should return 404 if user not found', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      const result = await getUserInfo(99, 1);
      expect(result).toEqual({ error: 'User not found', status: 404 });
    });

    it('should return 404 if user is blocked', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockResolvedValueOnce(mockFetchResponse({ blocked: true }));

      const result = await getUserInfo(2, 1);
      expect(result).toEqual({ error: 'User not found', status: 404 });
    });

    it('should return full user data when not blocked', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 10 }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 5 }))
        .mockResolvedValueOnce(mockFetchResponse({ isFollowing: true }));

      const result = await getUserInfo(2, 1);
      expect(result.data.username).toBe('janedoe');
      expect(result.data.followers_count).toBe(10);
      expect(result.data.following_count).toBe(5);
      expect(result.data.is_following).toBe(true);
      expect(result.data.is_private).toBe(false);
    });

    it('should return is_private true when user.is_private === 1', async () => {
      const privateUser = { ...mockUser, is_private: 1 };
      mockExecute.mockResolvedValueOnce([[privateUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isFollowing: false }));

      const result = await getUserInfo(2, 1);
      expect(result.data.is_private).toBe(true);
    });

    it('should return is_following false when not following', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isFollowing: false }));

      const result = await getUserInfo(2, 1);
      expect(result.data.is_following).toBe(false);
    });

    it('should throw if database fails', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(getUserInfo(2, 1)).rejects.toThrow('DB error');
    });

    it('should throw if fetch fails during block check', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockRejectedValue(new Error('Fetch error'));
      await expect(getUserInfo(2, 1)).rejects.toThrow('Fetch error');
    });

    it('should throw if fetch fails during social counts', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockRejectedValue(new Error('Fetch error'));
      await expect(getUserInfo(2, 1)).rejects.toThrow('Fetch error');
    });
  });
});

/* ══════════════════════════════════════════════════════════
   ProfileController
══════════════════════════════════════════════════════════ */

const app = require('../ProfileController');

describe('ProfileController', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── GET /health ────────────────────────────────────────
  describe('GET /health', () => {
    it('should return 200 with service status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', service: 'profile' });
    });
  });

  // ─── GET /search ────────────────────────────────────────
  describe('GET /search', () => {
    it('should return 401 if no token', async () => {
      const res = await request(app).get('/search?q=jane');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Access token missing');
    });

    it('should return 403 if token is invalid', async () => {
      const res = await request(app)
        .get('/search?q=jane')
        .set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Invalid or expired token');
    });

    it('should return 400 if query is missing', async () => {
      const res = await request(app)
        .get('/search')
        .set(authHeader());
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Search query is required');
    });

    it('should return 400 if query is empty string', async () => {
      const res = await request(app)
        .get('/search?q=')
        .set(authHeader());
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Search query is required');
    });

    it('should return 400 if query is only whitespace', async () => {
      const res = await request(app)
        .get('/search?q=%20')
        .set(authHeader());
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Search query is required');
    });

    it('should return 400 if query is less than 2 characters', async () => {
      const res = await request(app)
        .get('/search?q=j')
        .set(authHeader());
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Search query must be at least 2 characters');
    });

    it('should return 200 with users on valid query', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockResolvedValueOnce(mockFetchResponse({ blocked: false }));

      const res = await request(app)
        .get('/search?q=jane')
        .set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0].username).toBe('janedoe');
    });

    it('should return 200 with empty array if all results are blocked', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockResolvedValueOnce(mockFetchResponse({ blocked: true }));

      const res = await request(app)
        .get('/search?q=jane')
        .set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(0);
    });

    it('should return 500 on database error', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .get('/search?q=jane')
        .set(authHeader());
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });

    it('should return 500 on fetch error', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockRejectedValue(new Error('Fetch error'));

      const res = await request(app)
        .get('/search?q=jane')
        .set(authHeader());
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });

  // ─── GET /users/:userId ─────────────────────────────────
  describe('GET /users/:userId', () => {
    it('should return 401 if no token', async () => {
      const res = await request(app).get('/users/2');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Access token missing');
    });

    it('should return 403 if token is invalid', async () => {
      const res = await request(app)
        .get('/users/2')
        .set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Invalid or expired token');
    });

    it('should return 400 if userId is not a number', async () => {
      const res = await request(app)
        .get('/users/abc')
        .set(authHeader());
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid user ID');
    });

    it('should return 404 if user not found', async () => {
      mockExecute.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .get('/users/99')
        .set(authHeader());
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });

    it('should return 404 if user is blocked', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockResolvedValueOnce(mockFetchResponse({ blocked: true }));

      const res = await request(app)
        .get('/users/2')
        .set(authHeader());
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });

    it('should return 200 with user data', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 10 }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 5 }))
        .mockResolvedValueOnce(mockFetchResponse({ isFollowing: true }));

      const res = await request(app)
        .get('/users/2')
        .set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('janedoe');
      expect(res.body.user.followers_count).toBe(10);
      expect(res.body.user.following_count).toBe(5);
      expect(res.body.user.is_following).toBe(true);
    });

    it('should return 200 with is_private true', async () => {
      const privateUser = { ...mockUser, is_private: 1 };
      mockExecute.mockResolvedValueOnce([[privateUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isFollowing: false }));

      const res = await request(app)
        .get('/users/2')
        .set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.user.is_private).toBe(true);
    });

    it('should return 500 on database error', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .get('/users/2')
        .set(authHeader());
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });

    it('should return 500 on fetch error', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockRejectedValue(new Error('Fetch error'));

      const res = await request(app)
        .get('/users/2')
        .set(authHeader());
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });
});

/* ══════════════════════════════════════════════════════════
   ProfileServer
══════════════════════════════════════════════════════════ */

describe('ProfileServer', () => {
  it('should start and listen on a port', (done) => {
    const server = require('../ProfileController');
    const instance = server.listen(0, () => {
      expect(instance.listening).toBe(true);
      instance.close(done);
    });
  });
});