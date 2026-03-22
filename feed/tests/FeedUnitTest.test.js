process.env.NODE_ENV = 'test';

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.error.mockRestore();
});

/* ---------- SHARED MOCKS ---------- */

const mockExecute = jest.fn();

jest.mock('mysql2/promise', () => ({
  createPool: () => ({ execute: mockExecute }),
}));

/* ---------- IMPORTS ---------- */

const request = require('supertest');
const jwt = require('jsonwebtoken');

const makeToken = (id = 1) =>
  jwt.sign({ id, username: 'testuser' }, process.env.JWT_SECRET || 'secret');

const mockPost = {
  id: 10, user_id: 2, caption: 'Hello feed',
  created_at: new Date(), updated_at: new Date(),
  username: 'johndoe', first_name: 'John', last_name: 'Doe',
  profile_image_url: null, likes_count: 5, comments_count: 2,
};

const mockMedia = [
  { id: 1, post_id: 10, media_url: 'http://example.com/img.jpg', media_type: 'image', media_size_mb: '1.20', created_at: new Date() },
];

/* ══════════════════════════════════════════════════════════
   FeedModel tests
══════════════════════════════════════════════════════════ */

const { getFeed, getFeedTotal } = require('../FeedModel');

describe('FeedModel', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getFeedTotal', () => {
    it('should return early with empty data when getFeedTotal returns 0', async () => {
      // First call = getFeedTotal → returns [[{ total: 0 }]]
      mockExecute.mockResolvedValueOnce([[{ total: 0 }]]);
      const result = await getFeed(1, 20, 0);
      // Should hit line 34: if (total === 0) return { data: [], total: 0, has_more: false }
      expect(result).toEqual({ data: [], total: 0, has_more: false });
      // Only ONE execute call should have been made (getFeedTotal only, no posts query)
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
    it('should return total count of feed posts', async () => {
      mockExecute.mockResolvedValueOnce([[{ total: 42 }]]);
      const total = await getFeedTotal(1);
      expect(total).toBe(42);
    });

    it('should return 0 if no posts in feed', async () => {
      mockExecute.mockResolvedValueOnce([[{ total: 0 }]]);
      const total = await getFeedTotal(1);
      expect(total).toBe(0);
    });

    it('should throw if database fails', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(getFeedTotal(1)).rejects.toThrow('DB error');
    });
  });

  describe('getFeed', () => {
    it('should return empty feed with has_more false if total is 0', async () => {
      mockExecute.mockResolvedValueOnce([[{ total: 0 }]]);
      const result = await getFeed(1, 20, 0);
      expect(result).toEqual({ data: [], total: 0, has_more: false });
    });

    it('should return has_more false if on last page', async () => {
      // total=1, offset=0, posts.length=1 → 0+1 < 1 = false
      mockExecute
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[mockPost]])
        .mockResolvedValueOnce([mockMedia]);
      const result = await getFeed(1, 20, 0);
      expect(result.has_more).toBe(false);
      expect(result.total).toBe(1);
    });

    it('should return has_more true if more posts remain', async () => {
      // total=50, offset=0, posts.length=20 → 0+20 < 50 = true
      const posts = Array.from({ length: 20 }, (_, i) => ({ ...mockPost, id: i + 1 }));
      mockExecute
        .mockResolvedValueOnce([[{ total: 50 }]])
        .mockResolvedValueOnce([posts])
        .mockResolvedValueOnce([[]]);
      const result = await getFeed(1, 20, 0);
      expect(result.has_more).toBe(true);
      expect(result.total).toBe(50);
    });

    it('should return has_more false on last page with offset', async () => {
      // total=21, offset=20, posts.length=1 → 20+1 < 21 = false
      mockExecute
        .mockResolvedValueOnce([[{ total: 21 }]])
        .mockResolvedValueOnce([[mockPost]])
        .mockResolvedValueOnce([mockMedia]);
      const result = await getFeed(1, 20, 20);
      expect(result.has_more).toBe(false);
    });

    it('should return has_more true on middle page with offset', async () => {
      // total=50, offset=20, posts.length=20 → 20+20 < 50 = true
      const posts = Array.from({ length: 20 }, (_, i) => ({ ...mockPost, id: i + 1 }));
      mockExecute
        .mockResolvedValueOnce([[{ total: 50 }]])
        .mockResolvedValueOnce([posts])
        .mockResolvedValueOnce([[]]);
      const result = await getFeed(1, 20, 20);
      expect(result.has_more).toBe(true);
    });

    it('should return posts with media', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[mockPost]])
        .mockResolvedValueOnce([mockMedia]);
      const result = await getFeed(1, 20, 0);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].media).toHaveLength(1);
      expect(result.data[0].likes_count).toBe(5);
    });

    it('should return posts with empty media if no media exists', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[mockPost]])
        .mockResolvedValueOnce([[]]);
      const result = await getFeed(1, 20, 0);
      expect(result.data[0].media).toHaveLength(0);
    });

    it('should group multiple media items under the same post', async () => {
      const multiMedia = [
        { id: 1, post_id: 10, media_url: 'http://example.com/img1.jpg', media_type: 'image', media_size_mb: '1.00', created_at: new Date() },
        { id: 2, post_id: 10, media_url: 'http://example.com/img2.jpg', media_type: 'image', media_size_mb: '1.50', created_at: new Date() },
      ];
      mockExecute
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[mockPost]])
        .mockResolvedValueOnce([multiMedia]);
      const result = await getFeed(1, 20, 0);
      expect(result.data[0].media).toHaveLength(2);
    });

    it('should return empty data with total if posts query returns nothing', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ total: 3 }]])
        .mockResolvedValueOnce([[]]);
      const result = await getFeed(1, 20, 100);
      expect(result).toEqual({ data: [], total: 3, has_more: false });
    });

    it('should throw if database fails', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(getFeed(1, 20, 0)).rejects.toThrow('DB error');
    });
  });
});

/* ══════════════════════════════════════════════════════════
   FeedController tests
══════════════════════════════════════════════════════════ */

const app = require('../FeedController');

describe('FeedController', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /health', () => {
    it('should return 200 with service status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', service: 'feed' });
    });
  });

  describe('GET /feed - auth', () => {
    it('should return 401 if no token provided', async () => {
      const res = await request(app).get('/feed');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Access token missing');
    });

    it('should return 403 if token is invalid', async () => {
      const res = await request(app)
        .get('/feed')
        .set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Invalid or expired token');
    });
  });

  describe('GET /feed - pagination', () => {
    it('should default limit to 20 and offset to 0', async () => {
      mockExecute.mockResolvedValueOnce([[{ total: 0 }]]);
      const res = await request(app)
        .get('/feed')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(20);
      expect(res.body.offset).toBe(0);
    });

    it('should respect limit and offset query params', async () => {
      mockExecute.mockResolvedValueOnce([[{ total: 0 }]]);
      const res = await request(app)
        .get('/feed?limit=5&offset=10')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(5);
      expect(res.body.offset).toBe(10);
    });

    it('should cap limit at 100', async () => {
      mockExecute.mockResolvedValueOnce([[{ total: 0 }]]);
      const res = await request(app)
        .get('/feed?limit=999')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
    });

    it('should return next_offset when has_more is true', async () => {
      const posts = Array.from({ length: 20 }, (_, i) => ({ ...mockPost, id: i + 1 }));
      mockExecute
        .mockResolvedValueOnce([[{ total: 50 }]])
        .mockResolvedValueOnce([posts])
        .mockResolvedValueOnce([[]]);
      const res = await request(app)
        .get('/feed?limit=20&offset=0')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.has_more).toBe(true);
      expect(res.body.next_offset).toBe(20);
    });

    it('should return next_offset as null when has_more is false', async () => {
      mockExecute.mockResolvedValueOnce([[{ total: 0 }]]);
      const res = await request(app)
        .get('/feed')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.has_more).toBe(false);
      expect(res.body.next_offset).toBeNull();
    });
  });

  describe('GET /feed - results', () => {
    it('should return empty feed', async () => {
      mockExecute.mockResolvedValueOnce([[{ total: 0 }]]);
      const res = await request(app)
        .get('/feed')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.posts).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    it('should return feed posts with media and totals', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[mockPost]])
        .mockResolvedValueOnce([mockMedia]);
      const res = await request(app)
        .get('/feed')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.posts).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.posts[0].username).toBe('johndoe');
      expect(res.body.posts[0].media).toHaveLength(1);
    });

    it('should return 500 if database throws', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      const res = await request(app)
        .get('/feed')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });
});

/* ══════════════════════════════════════════════════════════
   FeedServer tests
══════════════════════════════════════════════════════════ */

describe('FeedServer', () => {
  it('should start and listen on a port', (done) => {
    const server = require('../FeedController');
    const instance = server.listen(0, () => {
      expect(instance.listening).toBe(true);
      instance.close(done);
    });
  });
});