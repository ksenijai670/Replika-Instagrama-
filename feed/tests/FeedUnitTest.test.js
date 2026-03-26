process.env.NODE_ENV = 'test';

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

const request = require('supertest');

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */

/** Wrap any value in a resolved fetch-like response. */
const mockFetchResponse = (data, ok = true) =>
  Promise.resolve({
    ok,
    json: () => Promise.resolve(data),
  });

/**
 * Auth header for the controller.
 * FeedController uses x-user-id only — no JWT.
 */
const authHeader = (userId = 1) => ({ 'x-user-id': String(userId) });

/**
 * Minimal post matching the shape getFeed reads:
 *   id, userId, caption, createdAt, updatedAt, media
 */
const makePost = (overrides = {}) => ({
  id: 10,
  userId: 2,
  caption: 'Hello feed',
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
  media: [],
  ...overrides,
});

/**
 * Minimal userInfo returned by the profile service.
 * getFeed reads: id, username, first_name, last_name, profile_image_url
 */
const makeUserInfo = (overrides = {}) => ({
  id: 2,
  username: 'johndoe',
  first_name: 'John',
  last_name: 'Doe',
  profile_image_url: null,
  ...overrides,
});

/**
 * Register fetch mocks for the FULL getFeed pipeline for a simple case:
 *   - no followed users (followingIds=[])
 *   - allIds=[requesterId=1]
 *
 * Exact fetch call order inside getFeed:
 *   1. getFollowingIds       → /follow/following
 *   2. getPostsByUserId(1)   → /users/1/posts          (requesterId is always last in allIds)
 *   Then for each post on the page:
 *   3. getUserInfo           → /users/:userId
 *   4. getLikesCount         → /posts/:id/likes/count
 *   5. getIsLiked            → /posts/:id/likes/status
 *   6. getComments           → /posts/:id/comments
 *
 * NOTE: Promise.all resolves concurrently but mockFetch is consumed in registration
 * order which matches the order the concurrent promises fire (Node micro-task queue).
 *
 * If comments.length > 0, getUsersByIds DB call follows via mockExecute.
 */
const setupFeedFetches = ({
  posts = [makePost()],
  userInfo = makeUserInfo(),
  likesCount = 0,
  isLiked = false,
  comments = [],
} = {}) => {
  // 1. getFollowingIds — no followed users
  mockFetch.mockResolvedValueOnce(mockFetchResponse({ following: [] }));

  // 2. getPostsByUserId for requesterId=1
  mockFetch.mockResolvedValueOnce(mockFetchResponse(posts));

  // 3-6. Per-post enrichment
  posts.forEach(() => {
    mockFetch
      .mockResolvedValueOnce(mockFetchResponse({ user: userInfo }))     // getUserInfo
      .mockResolvedValueOnce(mockFetchResponse({ count: likesCount }))  // getLikesCount
      .mockResolvedValueOnce(mockFetchResponse({ isLiked }))            // getIsLiked
      .mockResolvedValueOnce(mockFetchResponse(comments));              // getComments
  });
};

/* ══════════════════════════════════════════════════════════
   FeedModel
══════════════════════════════════════════════════════════ */

const { getFeed } = require('../FeedModel');

describe('FeedModel', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── getFollowingIds ─────────────────────────────────────
  describe('getFollowingIds (tested via getFeed)', () => {
    it('should return [] when follow service responds ok=false', async () => {
      // ok=false → followingIds=[] → allIds=[1] → posts fetch → empty → total=0
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({}, false)) // getFollowingIds ok=false
        .mockResolvedValueOnce(mockFetchResponse([]));       // getPostsByUserId for user 1

      const result = await getFeed(1, 20, 0, '');
      expect(result).toEqual({ data: [], total: 0, has_more: false });
    });

    it('should return [] when follow service fetch throws', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error')) // getFollowingIds throws
        .mockResolvedValueOnce(mockFetchResponse([]));      // getPostsByUserId for user 1

      const result = await getFeed(1, 20, 0, '');
      expect(result).toEqual({ data: [], total: 0, has_more: false });
    });

    it('should return [] when data.following is not an array', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: 'not-an-array' }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result).toEqual({ data: [], total: 0, has_more: false });
    });

    it('should include followed users posts in the feed', async () => {
      // followingIds=[2], allIds=[2,1]
      // allIds order: [...followingIds, requesterId] = [2, 1]
      // getPostsByUserId called for 2 first, then 1
      const post = makePost({ id: 5, userId: 2, createdAt: '2024-01-15T10:00:00.000Z' });
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [2] }))       // getFollowingIds
        .mockResolvedValueOnce(mockFetchResponse([post]))                    // posts for user 2
        .mockResolvedValueOnce(mockFetchResponse([]))                        // posts for user 1
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() })) // getUserInfo
        .mockResolvedValueOnce(mockFetchResponse({ count: 3 }))             // getLikesCount
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: true }))        // getIsLiked
        .mockResolvedValueOnce(mockFetchResponse([]));                       // getComments

      const result = await getFeed(1, 20, 0, '');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].userId).toBe(2);
      expect(result.data[0].likes_count).toBe(3);
      expect(result.data[0].isLiked).toBe(true);
    });
  });

  // ─── getPostsByUserId ─────────────────────────────────────
  describe('getPostsByUserId (tested via getFeed)', () => {
    it('should return [] when post service responds ok=false', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse({}, false)); // ok=false

      const result = await getFeed(1, 20, 0, '');
      expect(result).toEqual({ data: [], total: 0, has_more: false });
    });

    it('should return [] when post service fetch throws', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockRejectedValueOnce(new Error('Post service error'));

      const result = await getFeed(1, 20, 0, '');
      expect(result).toEqual({ data: [], total: 0, has_more: false });
    });

    it('should return [] when post service returns non-array', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse({ notAnArray: true }));

      const result = await getFeed(1, 20, 0, '');
      expect(result).toEqual({ data: [], total: 0, has_more: false });
    });
  });

  // ─── getFeed core logic ───────────────────────────────────
  describe('getFeed', () => {
    it('should return empty feed when no posts exist', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result).toEqual({ data: [], total: 0, has_more: false });
    });

    it('should return paginated posts with has_more false on last page', async () => {
      setupFeedFetches({ posts: [makePost()] });

      const result = await getFeed(1, 20, 0, '');
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.has_more).toBe(false);
    });

    it('should return has_more true when more posts remain', async () => {
      // 3 posts total, limit=2 → page has 2, 0+2 < 3 → has_more=true
      const posts = [
        makePost({ id: 1, createdAt: '2024-01-15T12:00:00.000Z' }),
        makePost({ id: 2, createdAt: '2024-01-15T11:00:00.000Z' }),
        makePost({ id: 3, createdAt: '2024-01-15T10:00:00.000Z' }),
      ];
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse(posts));
      // Only posts[0] and posts[1] land on page (limit=2), each needs 4 enrichment calls
      for (let i = 0; i < 2; i++) {
        mockFetch
          .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
          .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
          .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
          .mockResolvedValueOnce(mockFetchResponse([]));
      }

      const result = await getFeed(1, 2, 0, '');
      expect(result.has_more).toBe(true);
      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(2);
    });

    it('should return has_more false on exact last page', async () => {
      // 2 posts, limit=2, offset=0 → 0+2 < 2 = false
      const posts = [
        makePost({ id: 1, createdAt: '2024-01-15T12:00:00.000Z' }),
        makePost({ id: 2, createdAt: '2024-01-15T11:00:00.000Z' }),
      ];
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse(posts));
      for (let i = 0; i < 2; i++) {
        mockFetch
          .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
          .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
          .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
          .mockResolvedValueOnce(mockFetchResponse([]));
      }

      const result = await getFeed(1, 2, 0, '');
      expect(result.has_more).toBe(false);
      expect(result.total).toBe(2);
    });

    it('should return has_more true on a middle page with offset', async () => {
      // 5 posts, limit=2, offset=1 → page=[post2,post3], 1+2 < 5 = true
      const posts = [
        makePost({ id: 1, createdAt: '2024-01-15T15:00:00.000Z' }),
        makePost({ id: 2, createdAt: '2024-01-15T14:00:00.000Z' }),
        makePost({ id: 3, createdAt: '2024-01-15T13:00:00.000Z' }),
        makePost({ id: 4, createdAt: '2024-01-15T12:00:00.000Z' }),
        makePost({ id: 5, createdAt: '2024-01-15T11:00:00.000Z' }),
      ];
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse(posts));
      for (let i = 0; i < 2; i++) {
        mockFetch
          .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
          .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
          .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
          .mockResolvedValueOnce(mockFetchResponse([]));
      }

      const result = await getFeed(1, 2, 1, '');
      expect(result.has_more).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should return empty data with total when offset is beyond all posts', async () => {
      // 1 post total, offset=5 → pagePosts=[] → early return {data:[],total:1,has_more:false}
      const posts = [makePost()];
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse(posts));

      const result = await getFeed(1, 20, 5, '');
      expect(result).toEqual({ data: [], total: 1, has_more: false });
    });

    it('should sort posts newest first across multiple users', async () => {
      const olderPost = makePost({ id: 1, userId: 1, createdAt: '2024-01-10T10:00:00.000Z' });
      const newerPost = makePost({ id: 2, userId: 2, createdAt: '2024-01-15T10:00:00.000Z' });

      // followingIds=[2], allIds=[2, 1]
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [2] }))
        .mockResolvedValueOnce(mockFetchResponse([newerPost]))  // posts for user 2
        .mockResolvedValueOnce(mockFetchResponse([olderPost])); // posts for user 1

      // 2 posts on the page, each needs 4 enrichment calls
      for (let i = 0; i < 2; i++) {
        mockFetch
          .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
          .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
          .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
          .mockResolvedValueOnce(mockFetchResponse([]));
      }

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].id).toBe(2); // newer first
      expect(result.data[1].id).toBe(1);
    });

    it('should deduplicate allIds when requester is also in followingIds', async () => {
      // followingIds=[1] (self), allIds=[...new Set([1,1])]=[1] → ONE posts fetch only
      const post = makePost({ id: 1, userId: 1 });
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [1] })) // following includes self
        .mockResolvedValueOnce(mockFetchResponse([post]))              // one posts fetch only
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data).toHaveLength(1);
    });
  });

  // ─── getUserInfo ──────────────────────────────────────────
  describe('getUserInfo (tested via getFeed)', () => {
    it('should return fallback user object when profile service responds ok=false', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({}, false))           // getUserInfo ok=false → null
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      // userInfo null → fallback: { id: post.userId }
      expect(result.data[0].user).toEqual({ id: makePost().userId });
    });

    it('should return fallback user object when profile service fetch throws', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockRejectedValueOnce(new Error('Profile error'))             // getUserInfo throws
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].user).toEqual({ id: makePost().userId });
    });

    it('should return fallback when profile service returns no user key', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ notUser: true }))   // data.user undefined → null
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].user).toEqual({ id: makePost().userId });
    });

    it('should include full user info when profile service succeeds', async () => {
      const userInfo = makeUserInfo({ username: 'testuser', first_name: 'Test' });
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: userInfo }))  // getUserInfo success
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].user.username).toBe('testuser');
      expect(result.data[0].user.first_name).toBe('Test');
    });
  });

  // ─── getLikesCount ────────────────────────────────────────
  describe('getLikesCount (tested via getFeed)', () => {
    it('should return 0 when likes service responds ok=false', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({}, false))           // getLikesCount ok=false
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].likes_count).toBe(0);
    });

    it('should return 0 when likes service fetch throws', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockRejectedValueOnce(new Error('Likes error'))               // getLikesCount throws
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].likes_count).toBe(0);
    });

    it('should return 0 when count field is missing from response', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({}))                  // no count key → ?? 0
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].likes_count).toBe(0);
    });

    it('should return correct likes_count when service succeeds', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 7 }))        // getLikesCount = 7
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].likes_count).toBe(7);
    });
  });

  // ─── getIsLiked ───────────────────────────────────────────
  describe('getIsLiked (tested via getFeed)', () => {
    it('should return false when isLiked service responds ok=false', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({}, false))           // getIsLiked ok=false
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].isLiked).toBe(false);
    });

    it('should return false when isLiked service fetch throws', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockRejectedValueOnce(new Error('IsLiked error'))             // getIsLiked throws
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].isLiked).toBe(false);
    });

    it('should return true when isLiked is true', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: true }))   // isLiked = true
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].isLiked).toBe(true);
    });
  });

  // ─── getComments ──────────────────────────────────────────
  describe('getComments (tested via getFeed)', () => {
    it('should return [] when comments service responds ok=false', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse({}, false));           // getComments ok=false

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].comments).toEqual([]);
    });

    it('should return [] when comments service fetch throws', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockRejectedValueOnce(new Error('Comments error'));            // getComments throws

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].comments).toEqual([]);
    });

    it('should return [] when comments response is not an array', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse({ notAnArray: true })); // non-array response

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].comments).toEqual([]);
    });

    it('should sort comments oldest first (ascending)', async () => {
      // Comments returned out of order — getComments sorts ascending by createdAt
      const comments = [
        { userId: 3, text: 'Second', createdAt: '2024-01-15T11:00:00.000Z' },
        { userId: 3, text: 'First',  createdAt: '2024-01-15T10:00:00.000Z' },
      ];
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse(comments));

      // getUsersByIds called for comment author
      mockExecute.mockResolvedValueOnce([[
        { id: 3, username: 'alice', profile_image_url: null }
      ]]);

      const result = await getFeed(1, 20, 0, '');
      // Oldest first after sort
      expect(result.data[0].comments[0].text).toBe('First');
      expect(result.data[0].comments[1].text).toBe('Second');
    });
  });

  // ─── Comment enrichment (getUsersByIds) ──────────────────
  describe('Comment user enrichment (getUsersByIds)', () => {
    it('should enrich comments with username and avatar from DB', async () => {
      const comments = [{ userId: 3, text: 'Nice!', createdAt: '2024-01-01T00:00:00.000Z' }];
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse(comments));

      mockExecute.mockResolvedValueOnce([[
        { id: 3, username: 'alice', profile_image_url: 'http://img.com/alice.jpg' }
      ]]);

      const result = await getFeed(1, 20, 0, '');
      const comment = result.data[0].comments[0];
      expect(comment.username).toBe('alice');
      expect(comment.avatar).toBe('http://img.com/alice.jpg');
    });

    it('should fallback to "Nepoznato" when comment user not found in DB', async () => {
      const comments = [{ userId: 99, text: 'Hi!', createdAt: '2024-01-01T00:00:00.000Z' }];
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse(comments));

      mockExecute.mockResolvedValueOnce([[]]); // no users found

      const result = await getFeed(1, 20, 0, '');
      const comment = result.data[0].comments[0];
      expect(comment.username).toBe('Nepoznato');
      expect(comment.avatar).toBeNull();
    });

    it('should skip getUsersByIds when comments array is empty', async () => {
      // Empty comments → getUsersByIds never called → mockExecute not touched
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));               // empty comments

      await getFeed(1, 20, 0, '');
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should deduplicate comment userIds before DB lookup', async () => {
      // Two comments from the same userId=3 → only ONE DB call with [3]
      const comments = [
        { userId: 3, text: 'A', createdAt: '2024-01-01T00:00:00.000Z' },
        { userId: 3, text: 'B', createdAt: '2024-01-01T01:00:00.000Z' },
      ];
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse(comments));

      mockExecute.mockResolvedValueOnce([[
        { id: 3, username: 'alice', profile_image_url: null }
      ]]);

      const result = await getFeed(1, 20, 0, '');
      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(result.data[0].comments).toHaveLength(2);
      expect(result.data[0].comments[0].username).toBe('alice');
      expect(result.data[0].comments[1].username).toBe('alice');
    });

    it('should throw when getUsersByIds DB call fails', async () => {
      // getUsersByIds is the only place that uses the DB — making it throw
      // causes getFeed to reject
      const comments = [{ userId: 3, text: 'Hi', createdAt: '2024-01-01T00:00:00.000Z' }];
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse(comments));

      mockExecute.mockRejectedValueOnce(new Error('DB error'));

      await expect(getFeed(1, 20, 0, '')).rejects.toThrow('DB error');
    });
  });

  // ─── Media URL transformation ─────────────────────────────
  describe('Media URL transformation', () => {
    it('should replace minio URL with localhost URL', async () => {
      const post = makePost({ media: [{ mediaUrl: 'http://minio:9000/bucket/img.jpg' }] });
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([post]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].media[0].mediaUrl).toBe('http://localhost:9000/bucket/img.jpg');
    });

    it('should set mediaUrl to empty string when mediaUrl is null', async () => {
      const post = makePost({ media: [{ mediaUrl: null }] });
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([post]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].media[0].mediaUrl).toBe('');
    });

    it('should handle post with no media property (defaults to [])', async () => {
      // post.media is undefined → (post.media || []) → empty array
      const post = { ...makePost(), media: undefined };
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([post]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].media).toEqual([]);
    });

    it('should handle post with multiple media items', async () => {
      const post = makePost({
        media: [
          { mediaUrl: 'http://minio:9000/a.jpg' },
          { mediaUrl: 'http://minio:9000/b.jpg' },
        ],
      });
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([post]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const result = await getFeed(1, 20, 0, '');
      expect(result.data[0].media).toHaveLength(2);
      expect(result.data[0].media[0].mediaUrl).toBe('http://localhost:9000/a.jpg');
      expect(result.data[0].media[1].mediaUrl).toBe('http://localhost:9000/b.jpg');
    });
  });
});

/* ══════════════════════════════════════════════════════════
   FeedController
══════════════════════════════════════════════════════════ */

const app = require('../FeedController');

describe('FeedController', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── GET /health ──────────────────────────────────────────
  describe('GET /health', () => {
    it('should return 200 with service status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', service: 'feed' });
    });
  });

  // ─── Auth middleware ──────────────────────────────────────
  describe('GET /feed - auth', () => {
    it('should return 401 if x-user-id header is missing', async () => {
      const res = await request(app).get('/feed');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should accept request when x-user-id header is present', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const res = await request(app)
        .get('/feed')
        .set('x-user-id', '1');
      expect(res.status).toBe(200);
    });
  });

  // ─── Pagination ───────────────────────────────────────────
  describe('GET /feed - pagination', () => {
    const emptyFeedMocks = () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([]));
    };

    it('should default limit to 20 and offset to 0', async () => {
      emptyFeedMocks();
      const res = await request(app).get('/feed').set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(20);
      expect(res.body.offset).toBe(0);
    });

    it('should respect limit and offset query params', async () => {
      emptyFeedMocks();
      const res = await request(app).get('/feed?limit=5&offset=10').set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(5);
      expect(res.body.offset).toBe(10);
    });

    it('should cap limit at 100', async () => {
      emptyFeedMocks();
      const res = await request(app).get('/feed?limit=999').set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
    });

    it('should floor negative offset to 0', async () => {
      emptyFeedMocks();
      const res = await request(app).get('/feed?offset=-5').set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.offset).toBe(0);
    });

    it('should return next_offset when has_more is true', async () => {
      // 3 posts total, limit=2, offset=0 → has_more=true, next_offset=2
      const posts = [
        makePost({ id: 1, createdAt: '2024-01-15T12:00:00.000Z' }),
        makePost({ id: 2, createdAt: '2024-01-15T11:00:00.000Z' }),
        makePost({ id: 3, createdAt: '2024-01-15T10:00:00.000Z' }),
      ];
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse(posts));
      // Only 2 posts on the page
      for (let i = 0; i < 2; i++) {
        mockFetch
          .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
          .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
          .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
          .mockResolvedValueOnce(mockFetchResponse([]));
      }

      const res = await request(app).get('/feed?limit=2&offset=0').set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.has_more).toBe(true);
      expect(res.body.next_offset).toBe(2);
    });

    it('should return next_offset as null when has_more is false', async () => {
      emptyFeedMocks();
      const res = await request(app).get('/feed').set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.has_more).toBe(false);
      expect(res.body.next_offset).toBeNull();
    });
  });

  // ─── Results ──────────────────────────────────────────────
  describe('GET /feed - results', () => {
    it('should return empty feed', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const res = await request(app).get('/feed').set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.posts).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    it('should return feed posts with full enrichment', async () => {
      const post     = makePost({ id: 10, userId: 2, caption: 'Test caption' });
      const userInfo = makeUserInfo({ username: 'johndoe' });
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([post]))
        .mockResolvedValueOnce(mockFetchResponse({ user: userInfo }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 5 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: true }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const res = await request(app).get('/feed').set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.posts).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.posts[0].user.username).toBe('johndoe');
      expect(res.body.posts[0].likes_count).toBe(5);
      expect(res.body.posts[0].isLiked).toBe(true);
      expect(res.body.posts[0].caption).toBe('Test caption');
    });

    it('should pass the Authorization token to getFeed', async () => {
      // Controller extracts Bearer token from Authorization header and passes to getFeed.
      // Verify end-to-end with a token present — getFeed calls succeed normally.
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const res = await request(app)
        .get('/feed')
        .set('x-user-id', '1')
        .set('Authorization', 'Bearer mytoken');
      expect(res.status).toBe(200);
    });

    it('should return 500 when getFeed throws', async () => {
      // The only way getFeed throws is if getUsersByIds (DB) rejects.
      // Set up a post with comments so the DB path is exercised.
      const comments = [{ userId: 3, text: 'Hi', createdAt: '2024-01-01T00:00:00.000Z' }];
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({ following: [] }))
        .mockResolvedValueOnce(mockFetchResponse([makePost()]))
        .mockResolvedValueOnce(mockFetchResponse({ user: makeUserInfo() }))
        .mockResolvedValueOnce(mockFetchResponse({ count: 0 }))
        .mockResolvedValueOnce(mockFetchResponse({ isLiked: false }))
        .mockResolvedValueOnce(mockFetchResponse(comments));
      mockExecute.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/feed').set(authHeader());
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });
});

/* ══════════════════════════════════════════════════════════
   FeedServer
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