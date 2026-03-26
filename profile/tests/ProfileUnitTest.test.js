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

// minio mock
const mockPutObject = jest.fn();
const mockBucketExists = jest.fn();
const mockMakeBucket = jest.fn();
const mockSetBucketPolicy = jest.fn();

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    putObject: mockPutObject,
    bucketExists: mockBucketExists,
    makeBucket: mockMakeBucket,
    setBucketPolicy: mockSetBucketPolicy,
  })),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */

const makeToken = (payload = { userId: 1, username: 'testuser' }) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });

const authHeader = () => ({ Authorization: `Bearer ${makeToken()}` });

const mockFetchResponse = (data, ok = true) =>
  Promise.resolve({
    ok,
    json: () => Promise.resolve(data),
  });

// Standard mock DB user row
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

/**
 * Sets up fetch mocks in the exact order getUserInfo() calls them:
 *   1. isBlocked         → /block-status        (reads data.blocked)
 *   2. getFollowersCount → /stats/:id            (reads data.followers)
 *   3. getFollowingCount → /stats/:id            (reads data.following)
 *   4. getIsFollowing    → /relationship-status  (reads data.followStatus === 'ACCEPTED')
 *   5. getPostsByUserId  → /users/:id/posts      (returns array of posts)
 */
const setupGetUserInfoFetches = ({
  blocked = false,
  followers = 10,
  following = 5,
  followStatus = 'ACCEPTED',
  posts = [],
} = {}) => {
  mockFetch
    .mockResolvedValueOnce(mockFetchResponse({ blocked }))
    .mockResolvedValueOnce(mockFetchResponse({ followers, following }))
    .mockResolvedValueOnce(mockFetchResponse({ followers, following }))
    .mockResolvedValueOnce(mockFetchResponse({ followStatus }))
    .mockResolvedValueOnce(mockFetchResponse(posts));
};

/* ══════════════════════════════════════════════════════════
   ProfileModel
══════════════════════════════════════════════════════════ */

const {
  searchUsers,
  getUserInfo,
  getFollowers,
  getFollowing,
  updateUserProfile,
  getUsersByIdsPublic,
} = require('../ProfileModel');

describe('ProfileModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── searchUsers ─────────────────────────────────────────
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

    // isBlocked() swallows all fetch errors and returns false,
    // so the user is treated as not-blocked and included in results.
    it('should include user when isBlocked fetch fails (error swallowed, defaults to false)', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockRejectedValue(new Error('Fetch error'));

      const result = await searchUsers('jane', 1);
      expect(result).toHaveLength(1);
    });

    it('should include user when isBlocked fetch responds ok=false', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockResolvedValueOnce(mockFetchResponse({}, false));

      const result = await searchUsers('jane', 1);
      expect(result).toHaveLength(1);
    });
  });

  // ─── getUserInfo ─────────────────────────────────────────
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
      setupGetUserInfoFetches({ followers: 10, following: 5, followStatus: 'ACCEPTED' });

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
      setupGetUserInfoFetches({ followers: 0, following: 0, followStatus: 'NONE' });

      const result = await getUserInfo(2, 1);
      expect(result.data.is_private).toBe(true);
    });

    it('should return is_following false when followStatus is not ACCEPTED', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      setupGetUserInfoFetches({ followers: 0, following: 0, followStatus: 'PENDING' });

      const result = await getUserInfo(2, 1);
      expect(result.data.is_following).toBe(false);
    });

    it('should return 0 followers_count if field missing from stats response', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({}))   // no "followers" key → 0
        .mockResolvedValueOnce(mockFetchResponse({}))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getUserInfo(2, 1);
      expect(result.data.followers_count).toBe(0);
    });

    it('should return 0 following_count if field missing from stats response', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 3 }))
        .mockResolvedValueOnce(mockFetchResponse({}))   // no "following" key → 0
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getUserInfo(2, 1);
      expect(result.data.following_count).toBe(0);
    });

    it('should return 0 counts when stats fetch responds ok=false', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({}, false))
        .mockResolvedValueOnce(mockFetchResponse({}, false))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getUserInfo(2, 1);
      expect(result.data.followers_count).toBe(0);
      expect(result.data.following_count).toBe(0);
    });

    it('should return is_following false when relationship-status fetch responds ok=false', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 1, following: 1 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 1, following: 1 }))
        .mockResolvedValueOnce(mockFetchResponse({}, false))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getUserInfo(2, 1);
      expect(result.data.is_following).toBe(false);
    });

    it('should throw if database fails', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(getUserInfo(2, 1)).rejects.toThrow('DB error');
    });

    // All fetch helpers catch their errors and return safe defaults.
    it('should resolve with defaults when all fetch calls fail', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockRejectedValue(new Error('Fetch error'));

      const result = await getUserInfo(2, 1);
      expect(result.data).toBeDefined();
      expect(result.data.followers_count).toBe(0);
      expect(result.data.following_count).toBe(0);
      expect(result.data.is_following).toBe(false);
    });

    it('should resolve with defaults when fetch fails after block check', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockRejectedValue(new Error('Fetch error'));

      const result = await getUserInfo(2, 1);
      expect(result.data).toBeDefined();
      expect(result.data.followers_count).toBe(0);
      expect(result.data.following_count).toBe(0);
    });

    it('should include posts array in result', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      setupGetUserInfoFetches();

      const result = await getUserInfo(2, 1, 'token');
      expect(Array.isArray(result.data.posts)).toBe(true);
    });

    // ── getPostsByUserId coverage via getUserInfo ────────────
    // getPostsByUserId is a non-exported internal helper. All its branches
    // are exercised here by controlling what the posts fetch call returns.

    it('should return empty posts if post service fetch fails', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockRejectedValueOnce(new Error('Post service error'));

      const result = await getUserInfo(2, 1, 'token');
      expect(result.data.posts).toEqual([]);
    });

    it('should return empty posts if post service responds ok=false', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse({}, false));

      const result = await getUserInfo(2, 1, 'token');
      expect(result.data.posts).toEqual([]);
    });

    it('should transform minio media URLs to localhost in posts', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([
          { id: 10, media: [{ mediaUrl: 'http://minio:9000/file.jpg' }] }
        ]))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse([]))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }));

      const result = await getUserInfo(2, 1, 'token');
      expect(result.data.posts[0].media[0].mediaUrl).toBe('http://localhost:9000/file.jpg');
    });

    it('should handle post media with null mediaUrl (replace to empty string)', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([
          { id: 10, media: [{ mediaUrl: null }] }
        ]))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse([]))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }));

      const result = await getUserInfo(2, 1, 'token');
      expect(result.data.posts[0].media[0].mediaUrl).toBe('');
    });

    it('should attach likes_count, comments, and isLiked to posts', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([{ id: 10, media: [] }]))
        .mockResolvedValueOnce(mockFetchResponse({ count: 5 }))
        .mockResolvedValueOnce(mockFetchResponse([]))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: true }));

      const result = await getUserInfo(2, 1, 'token');
      expect(result.data.posts[0].likes_count).toBe(5);
      expect(result.data.posts[0].isLiked).toBe(true);
      expect(Array.isArray(result.data.posts[0].comments)).toBe(true);
    });

    it('should sort post comments by newest first', async () => {
      mockExecute
        .mockResolvedValueOnce([[mockUser]])
        .mockResolvedValueOnce([[
          { id: 2, username: 'john', first_name: 'John', last_name: 'Doe', profile_image_url: null }
        ]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([{ id: 10, media: [] }]))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse([
          { userId: 2, createdAt: '2023-01-01' },
          { userId: 2, createdAt: '2024-01-01' },
        ]))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }));

      const result = await getUserInfo(2, 1, 'token');
      expect(result.data.posts[0].comments[0].createdAt).toBe('2024-01-01');
    });

    it('should enrich post comments with user data', async () => {
      mockExecute
        .mockResolvedValueOnce([[mockUser]])
        .mockResolvedValueOnce([[
          { id: 3, username: 'john', first_name: 'John', last_name: 'Doe', profile_image_url: 'img.jpg' }
        ]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([{ id: 10, media: [] }]))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse([{ userId: 3, createdAt: '2024-01-01' }]))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }));

      const result = await getUserInfo(2, 1, 'token');
      const comment = result.data.posts[0].comments[0];
      expect(comment.username).toBe('john');
      expect(comment.firstName).toBe('John');
      expect(comment.avatar).toBe('img.jpg');
    });

    it('should fallback comment user to "Nepoznato" when commenter not found in DB', async () => {
      mockExecute
        .mockResolvedValueOnce([[mockUser]])
        .mockResolvedValueOnce([[]]); // no user found for commenter
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([{ id: 10, media: [] }]))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse([{ userId: 99, createdAt: '2024-01-01' }]))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }));

      const result = await getUserInfo(2, 1, 'token');
      const comment = result.data.posts[0].comments[0];
      expect(comment.username).toBe('Nepoznato');
      expect(comment.avatar).toBe(null);
    });

    it('should handle likes fetch failure gracefully in posts (defaults to 0)', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([{ id: 10, media: [] }]))
        .mockRejectedValueOnce(new Error('Likes error'))
        .mockResolvedValueOnce(mockFetchResponse([]))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }));

      const result = await getUserInfo(2, 1, 'token');
      expect(result.data.posts[0].likes_count).toBe(0);
    });

    it('should handle comments fetch failure gracefully in posts (defaults to [])', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([{ id: 10, media: [] }]))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockRejectedValueOnce(new Error('Comments error'))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }));

      const result = await getUserInfo(2, 1, 'token');
      expect(result.data.posts[0].comments).toEqual([]);
    });

    it('should handle isLiked fetch failure gracefully in posts (defaults to false)', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([{ id: 10, media: [] }]))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse([]))
        .mockRejectedValueOnce(new Error('Like status error'));

      const result = await getUserInfo(2, 1, 'token');
      expect(result.data.posts[0].isLiked).toBe(false);
    });

    // Covers model line 197: post has no media property at all (the `if (post.media)` branch is false)
    it('should handle posts with no media property', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        // post has no media key at all
        .mockResolvedValueOnce(mockFetchResponse([{ id: 10 }]))
        .mockResolvedValueOnce(mockFetchResponse({ count: 2 }))
        .mockResolvedValueOnce(mockFetchResponse([]))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: true }));

      const result = await getUserInfo(2, 1, 'token');
      expect(result.data.posts[0].likes_count).toBe(2);
      expect(result.data.posts[0].isLiked).toBe(true);
    });

    // Covers model line 140: getLikesCount ok=false → returns 0
    it('should return 0 likes_count when likes fetch responds ok=false', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([{ id: 10, media: [] }]))
        .mockResolvedValueOnce(mockFetchResponse({}, false))   // getLikesCount ok=false
        .mockResolvedValueOnce(mockFetchResponse([]))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }));

      const result = await getUserInfo(2, 1, 'token');
      expect(result.data.posts[0].likes_count).toBe(0);
    });

    // Covers model line 157: getComments ok=false → returns []
    it('should return empty comments when comments fetch responds ok=false', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([{ id: 10, media: [] }]))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({}, false))   // getComments ok=false
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }));

      const result = await getUserInfo(2, 1, 'token');
      expect(result.data.posts[0].comments).toEqual([]);
    });

    // Covers model line 174: getIsLiked ok=false → returns false
    it('should return isLiked false when isLiked fetch responds ok=false', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: 0, following: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ followStatus: 'NONE' }))
        .mockResolvedValueOnce(mockFetchResponse([{ id: 10, media: [] }]))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse([]))
        .mockResolvedValueOnce(mockFetchResponse({}, false));  // getIsLiked ok=false

      const result = await getUserInfo(2, 1, 'token');
      expect(result.data.posts[0].isLiked).toBe(false);
    });
  });

  // ─── getFollowers ─────────────────────────────────────────
  describe('getFollowers', () => {
    it('should return 404 if user is blocked', async () => {
      mockFetch.mockResolvedValueOnce(mockFetchResponse({ blocked: true }));
      const result = await getFollowers(2, 1);
      expect(result).toEqual({ error: 'User not found', status: 404 });
    });

    it('should return follower users when not blocked', async () => {
      const followerUser = { id: 5, username: 'follower', first_name: 'F', last_name: 'L', profile_image_url: null };
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: [5] }));
      mockExecute.mockResolvedValueOnce([[followerUser]]);

      const result = await getFollowers(2, 1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].username).toBe('follower');
    });

    it('should return empty data array if no followers', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: [] }));

      const result = await getFollowers(2, 1);
      expect(result.data).toHaveLength(0);
    });

    it('should return empty data array if followers fetch fails', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockRejectedValue(new Error('Fetch error'));

      const result = await getFollowers(2, 1);
      expect(result.data).toHaveLength(0);
    });

    it('should return empty data array if followers fetch responds ok=false', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({}, false));

      const result = await getFollowers(2, 1);
      expect(result.data).toHaveLength(0);
    });

    // Covers the `data.followers || []` fallback (line 123): ok=true but no "followers" key
    it('should return empty data array if followers response has no followers key', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({})); // ok=true, but data.followers is undefined

      const result = await getFollowers(2, 1);
      expect(result.data).toHaveLength(0);
    });
  });

  // ─── getFollowing ─────────────────────────────────────────
  describe('getFollowing', () => {
    it('should return 404 if user is blocked', async () => {
      mockFetch.mockResolvedValueOnce(mockFetchResponse({ blocked: true }));
      const result = await getFollowing(2, 1);
      expect(result).toEqual({ error: 'User not found', status: 404 });
    });

    it('should return following users when not blocked', async () => {
      const followingUser = { id: 6, username: 'followed', first_name: 'F', last_name: 'U', profile_image_url: null };
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ following: [6] }));
      mockExecute.mockResolvedValueOnce([[followingUser]]);

      const result = await getFollowing(2, 1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].username).toBe('followed');
    });

    it('should return empty data array if no following', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }));

      const result = await getFollowing(2, 1);
      expect(result.data).toHaveLength(0);
    });

    it('should return empty data array if following fetch fails', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockRejectedValue(new Error('Fetch error'));

      const result = await getFollowing(2, 1);
      expect(result.data).toHaveLength(0);
    });

    it('should return empty data array if following fetch responds ok=false', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({}, false));

      const result = await getFollowing(2, 1);
      expect(result.data).toHaveLength(0);
    });

    // Covers the `data.following || []` fallback (line 109): ok=true but no "following" key
    it('should return empty data array if following response has no following key', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({})); // ok=true, but data.following is undefined

      const result = await getFollowing(2, 1);
      expect(result.data).toHaveLength(0);
    });
  });

  // ─── updateUserProfile ────────────────────────────────────
  describe('updateUserProfile', () => {
    it('should return true when row is updated', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const result = await updateUserProfile(1, 'Jane', 'Doe', 'bio', 'http://img');
      expect(result).toBe(true);
    });

    it('should return false when no row is updated', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      const result = await updateUserProfile(999, 'Jane', 'Doe', 'bio', null);
      expect(result).toBe(false);
    });

    it('should throw if database fails', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(updateUserProfile(1, 'Jane', 'Doe', 'bio', null)).rejects.toThrow('DB error');
    });
  });

  // ─── getUsersByIdsPublic ──────────────────────────────────
  describe('getUsersByIdsPublic', () => {
    it('should return users for given ids', async () => {
      const publicUser = { id: 2, username: 'janedoe', first_name: 'Jane', last_name: 'Doe', profile_image_url: null };
      mockExecute.mockResolvedValueOnce([[publicUser]]);

      const result = await getUsersByIdsPublic([2]);
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('janedoe');
    });

    it('should return empty array for empty ids input', async () => {
      const result = await getUsersByIdsPublic([]);
      expect(result).toEqual([]);
    });

    it('should throw if database fails', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(getUsersByIdsPublic([1])).rejects.toThrow('DB error');
    });
  });
});

/* ══════════════════════════════════════════════════════════
   ProfileController
══════════════════════════════════════════════════════════ */

const app = require('../ProfileController');

describe('ProfileController', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── GET /health ──────────────────────────────────────────
  describe('GET /health', () => {
    it('should return 200 with service status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', service: 'profile' });
    });
  });

  // ─── GET /search ──────────────────────────────────────────
  describe('GET /search', () => {
    it('should return 401 if no token and no x-user-id header', async () => {
      const res = await request(app).get('/search?q=jane');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized: No token or x-user-id');
    });

    it('should authenticate via x-user-id header instead of Bearer token', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockResolvedValueOnce(mockFetchResponse({ blocked: false }));

      const res = await request(app)
        .get('/search?q=jane')
        .set('x-user-id', '1');
      expect(res.status).toBe(200);
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

    // isBlocked() swallows fetch errors → user passes through → 200
    it('should return 200 with user included when isBlocked fetch fails', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockRejectedValue(new Error('Fetch error'));

      const res = await request(app)
        .get('/search?q=jane')
        .set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
    });
  });

  // ─── GET /users/:userId ───────────────────────────────────
  describe('GET /users/:userId', () => {
    it('should return 401 if no token and no x-user-id header', async () => {
      const res = await request(app).get('/users/2');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized: No token or x-user-id');
    });

    it('should authenticate via x-user-id header', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      setupGetUserInfoFetches();

      const res = await request(app)
        .get('/users/2')
        .set('x-user-id', '1');
      expect(res.status).toBe(200);
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

    it('should return 200 with full user data', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      setupGetUserInfoFetches({ followers: 10, following: 5, followStatus: 'ACCEPTED' });

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
      setupGetUserInfoFetches({ followers: 0, following: 0, followStatus: 'NONE' });

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

    // All fetch helpers swallow errors → resolves with 0/false defaults → 200
    it('should return 200 with defaults when all fetch calls fail', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      mockFetch.mockRejectedValue(new Error('Fetch error'));

      const res = await request(app)
        .get('/users/2')
        .set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.user.followers_count).toBe(0);
      expect(res.body.user.following_count).toBe(0);
    });
  });

  // ─── GET /users/:userId/followers ────────────────────────
  describe('GET /users/:userId/followers', () => {
    it('should return 401 if no token and no x-user-id', async () => {
      const res = await request(app).get('/users/2/followers');
      expect(res.status).toBe(401);
    });

    it('should return 400 if userId is not a number', async () => {
      const res = await request(app)
        .get('/users/abc/followers')
        .set(authHeader());
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid user ID');
    });

    it('should return 404 if user is blocked', async () => {
      mockFetch.mockResolvedValueOnce(mockFetchResponse({ blocked: true }));

      const res = await request(app)
        .get('/users/2/followers')
        .set(authHeader());
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });

    it('should return 200 with followers list', async () => {
      const followerUser = { id: 5, username: 'follower', first_name: 'F', last_name: 'L', profile_image_url: null };
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: [5] }));
      mockExecute.mockResolvedValueOnce([[followerUser]]);

      const res = await request(app)
        .get('/users/2/followers')
        .set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.followers).toHaveLength(1);
      expect(res.body.followers[0].username).toBe('follower');
    });

    it('should return 200 with empty followers when fetch fails', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockRejectedValue(new Error('Fetch error'));

      const res = await request(app)
        .get('/users/2/followers')
        .set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.followers).toHaveLength(0);
    });

    // Covers controller lines 116-117: the catch block fires when getFollowers throws
    // (getUsersByIds DB call throws after the followers fetch succeeds)
    it('should return 500 when getFollowers throws unexpectedly', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ followers: [5] }));
      mockExecute.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .get('/users/2/followers')
        .set(authHeader());
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });

  // ─── GET /users/:userId/following ────────────────────────
  describe('GET /users/:userId/following', () => {
    it('should return 401 if no token and no x-user-id', async () => {
      const res = await request(app).get('/users/2/following');
      expect(res.status).toBe(401);
    });

    it('should return 400 if userId is not a number', async () => {
      const res = await request(app)
        .get('/users/abc/following')
        .set(authHeader());
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid user ID');
    });

    it('should return 404 if user is blocked', async () => {
      mockFetch.mockResolvedValueOnce(mockFetchResponse({ blocked: true }));

      const res = await request(app)
        .get('/users/2/following')
        .set(authHeader());
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });

    it('should return 200 with following list', async () => {
      const followingUser = { id: 6, username: 'followed', first_name: 'F', last_name: 'U', profile_image_url: null };
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ following: [6] }));
      mockExecute.mockResolvedValueOnce([[followingUser]]);

      const res = await request(app)
        .get('/users/2/following')
        .set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.following).toHaveLength(1);
      expect(res.body.following[0].username).toBe('followed');
    });

    it('should return 200 with empty following when fetch fails', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockRejectedValue(new Error('Fetch error'));

      const res = await request(app)
        .get('/users/2/following')
        .set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.following).toHaveLength(0);
    });

    // Covers controller lines 138-139: the catch block fires when getFollowing throws
    // (getUsersByIds DB call throws after the following fetch succeeds)
    it('should return 500 when getFollowing throws unexpectedly', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ blocked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ following: [6] }));
      mockExecute.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .get('/users/2/following')
        .set(authHeader());
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });

  // ─── PUT /users/me ────────────────────────────────────────
  describe('PUT /users/me', () => {
    it('should return 401 if no token and no x-user-id', async () => {
      const res = await request(app)
        .put('/users/me')
        .send({ first_name: 'Jane', last_name: 'Doe', bio: 'hi', profile_image_url: null });
      expect(res.status).toBe(401);
    });

    it('should return 200 on successful profile update', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .put('/users/me')
        .set(authHeader())
        .send({ first_name: 'Jane', last_name: 'Doe', bio: 'Updated bio', profile_image_url: 'http://img' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Profil uspesno azuriran');
    });

    it('should return 500 on database error', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .put('/users/me')
        .set(authHeader())
        .send({ first_name: 'Jane', last_name: 'Doe', bio: 'bio', profile_image_url: null });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });

  // ─── POST /users/by-ids ───────────────────────────────────
  describe('POST /users/by-ids', () => {
    it('should return 401 if no token and no x-user-id', async () => {
      const res = await request(app)
        .post('/users/by-ids')
        .send({ ids: [2] });
      expect(res.status).toBe(401);
    });

    it('should return 400 if ids is not an array', async () => {
      const res = await request(app)
        .post('/users/by-ids')
        .set(authHeader())
        .send({ ids: 'notanarray' });
      expect(res.status).toBe(400);
    });

    it('should return 400 if ids is an empty array', async () => {
      const res = await request(app)
        .post('/users/by-ids')
        .set(authHeader())
        .send({ ids: [] });
      expect(res.status).toBe(400);
    });

    it('should return 200 with users for given ids', async () => {
      const publicUser = { id: 2, username: 'janedoe', first_name: 'Jane', last_name: 'Doe', profile_image_url: null };
      // mockResolvedValueOnce ensures this mock is consumed only by this test
      mockExecute.mockResolvedValueOnce([[publicUser]]);

      const res = await request(app)
        .post('/users/by-ids')
        .set(authHeader())
        .send({ ids: [2] });
      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0].username).toBe('janedoe');
    });

    it('should return 500 on database error', async () => {
      // mockRejectedValueOnce (not mockRejectedValue) to avoid polluting later tests
      mockExecute.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .post('/users/by-ids')
        .set(authHeader())
        .send({ ids: [2] });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });
});


/* ══════════════════════════════════════════════════════════
   ProfileModel — updateAvatarOnly (lines 355-359)
══════════════════════════════════════════════════════════ */

describe('ProfileModel — updateAvatarOnly', () => {
  const { updateAvatarOnly } = require('../ProfileModel');

  beforeEach(() => jest.clearAllMocks());

  it('should return true when affectedRows > 0', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const result = await updateAvatarOnly(1, 'http://localhost:9000/bucket/avatar.jpg');
    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET profile_image_url'),
      ['http://localhost:9000/bucket/avatar.jpg', 1]
    );
  });

  it('should return false when affectedRows === 0', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const result = await updateAvatarOnly(999, 'http://url');
    expect(result).toBe(false);
  });

  it('should throw if database fails', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB error'));
    await expect(updateAvatarOnly(1, 'http://url')).rejects.toThrow('DB error');
  });
});

/* ══════════════════════════════════════════════════════════
   ProfileController — POST /avatar (lines 159-184)
══════════════════════════════════════════════════════════ */

describe('ProfileController — POST /avatar', () => {
  const app = require('../ProfileController');

  beforeEach(() => jest.clearAllMocks());

  it('should return 401 if no auth token', async () => {
    const res = await request(app)
      .post('/avatar')
      .attach('avatar', Buffer.from('fake-image'), 'test.jpg');
    expect(res.status).toBe(401);
  });

  it('should return 400 if no file is attached', async () => {
    const res = await request(app)
      .post('/avatar')
      .set(authHeader());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Nema fajla');
  });

  it('should return 200 and url on successful upload', async () => {
    // putObject calls callback with (null, etag) — success
    mockPutObject.mockImplementation((_b, _n, _buf, _size, _meta, cb) => cb(null, 'etag'));
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/avatar')
      .set(authHeader())
      .attach('avatar', Buffer.from('fake-image'), 'photo.png');

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/http:\/\/localhost:9000\/.+\/avatar-/);
    expect(res.body.message).toBe('Uspesno');
  });

  it('should return 500 if minio putObject fails', async () => {
    mockPutObject.mockImplementation((_b, _n, _buf, _size, _meta, cb) =>
      cb(new Error('MinIO connection error'))
    );

    const res = await request(app)
      .post('/avatar')
      .set(authHeader())
      .attach('avatar', Buffer.from('fake-image'), 'photo.jpg');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Greska pri uploadu');
    expect(res.body.detail).toBe('MinIO connection error');
  });

  it('should return 500 if updateAvatarOnly (DB) fails after upload', async () => {
    mockPutObject.mockImplementation((_b, _n, _buf, _size, _meta, cb) => cb(null, 'etag'));
    mockExecute.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .post('/avatar')
      .set(authHeader())
      .attach('avatar', Buffer.from('fake-image'), 'photo.jpg');

    expect(res.status).toBe(500);
    expect(res.body.detail).toBe('DB error');
  });

  it('should work with x-user-id header instead of JWT', async () => {
    mockPutObject.mockImplementation((_b, _n, _buf, _size, _meta, cb) => cb(null, 'etag'));
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/avatar')
      .set({ 'x-user-id': '42' })
      .attach('avatar', Buffer.from('fake-image'), 'photo.jpeg');

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/avatar-42-/);
  });
});

/* ══════════════════════════════════════════════════════════
   minio.js — initMinio branches (lines 16-31)
══════════════════════════════════════════════════════════ */

describe('minio.js — initMinio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('should not create bucket if it already exists', async () => {
    // Re-mock minio inside resetModules context
    jest.mock('minio', () => ({
      Client: jest.fn().mockImplementation(() => ({
        putObject: jest.fn(),
        bucketExists: jest.fn().mockResolvedValue(true),
        makeBucket: jest.fn(),
        setBucketPolicy: jest.fn(),
      })),
    }));

    // Requiring minio.js runs initMinio() immediately — wait for it to settle
    require('../config/minio');
    await new Promise(r => setTimeout(r, 50));

    // bucketExists returned true, so makeBucket should NOT have been called
    const minioMod = require('minio');
    const instance = new minioMod.Client();
    expect(instance.makeBucket).not.toHaveBeenCalled();
  });

  it('should create bucket and set policy if bucket does not exist', async () => {
    const mockMakeBucketLocal = jest.fn().mockResolvedValue(undefined);
    const mockSetPolicyLocal = jest.fn().mockResolvedValue(undefined);
    const mockBucketExistsLocal = jest.fn().mockResolvedValue(false);

    jest.mock('minio', () => ({
      Client: jest.fn().mockImplementation(() => ({
        putObject: jest.fn(),
        bucketExists: mockBucketExistsLocal,
        makeBucket: mockMakeBucketLocal,
        setBucketPolicy: mockSetPolicyLocal,
      })),
    }));

    require('../config/minio');
    await new Promise(r => setTimeout(r, 50));

    expect(mockMakeBucketLocal).toHaveBeenCalled();
    expect(mockSetPolicyLocal).toHaveBeenCalled();
  });

  it('should swallow errors thrown during initMinio', async () => {
    jest.mock('minio', () => ({
      Client: jest.fn().mockImplementation(() => ({
        putObject: jest.fn(),
        bucketExists: jest.fn().mockRejectedValue(new Error('Connection refused')),
        makeBucket: jest.fn(),
        setBucketPolicy: jest.fn(),
      })),
    }));

    // Should NOT throw — initMinio catches internally
    expect(() => require('../config/minio')).not.toThrow();
    await new Promise(r => setTimeout(r, 50));
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