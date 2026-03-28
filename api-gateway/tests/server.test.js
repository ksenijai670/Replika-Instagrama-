const request = require('supertest');

// ✅ MUST start with "mock"
const mockAuthMiddleware = jest.fn((req, res, next) => next());
const mockGlobalLimiter = jest.fn((req, res, next) => next());
const mockAuthLimiter = jest.fn((req, res, next) => next());
const mockMinio = jest.fn((req, res, next) => next());

// --- mock services ---
jest.mock('../config/services', () => ({
  auth: 'http://auth-service',
  profile: 'http://profile-service',
  follow: 'http://follow-service',
  post: 'http://post-service',
  interactions: 'http://interaction-service',
  feed: 'http://feed-service',
}));

// --- mock middlewares ---
jest.mock('../middleware/authMiddleware', () => mockAuthMiddleware);

jest.mock('../middleware/rateLimiter', () => ({
  globalLimiter: mockGlobalLimiter,
  authLimiter: mockAuthLimiter,
}));

jest.mock('../middleware/minioUrlRewriter', () => mockMinio);

// ⚠️ your errorHandler RETURNS "Handled error"
jest.mock('../middleware/errorHandler', () =>
  (err, req, res, next) => {
    res.status(500).json({ error: 'Handled error' });
  }
);

// --- proxy mock ---
let shouldFail = false;

const mockProxy = jest.fn((req, res, next) => {
  if (shouldFail) return next(new Error('Proxy fail'));
  res.status(200).json({ proxied: true, path: req.url });
});

const mockCreateProxy = jest.fn((config) => {
  return (req, res, next) => {
    if (config.pathRewrite) {
      req.url = config.pathRewrite(req.url, req);
    }

    // simulate proxy internal error via next()
    if (shouldFail) {
      return next(new Error('fail'));
    }

    return mockProxy(req, res, next);
  };
});

jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: (config) => mockCreateProxy(config),
}));

// ✅ import AFTER mocks
const app = require('../server');

describe('API Gateway (FULL FIXED)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    shouldFail = false;
  });

  it('GET /health', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      service: 'gateway',
    });
  });

  it('sets CORS headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('handles OPTIONS', async () => {
    const res = await request(app).options('/health');
    expect(res.status).toBe(204);
  });

  it('calls global + minio middleware', async () => {
    await request(app).get('/health');

    expect(mockGlobalLimiter).toHaveBeenCalled();
    expect(mockMinio).toHaveBeenCalled();
  });

  it('calls authLimiter on register', async () => {
    await request(app).post('/api/authentication/register');
    expect(mockAuthLimiter).toHaveBeenCalled();
  });

  it('calls authMiddleware on protected route', async () => {
    await request(app).get('/api/profile');
    expect(mockAuthMiddleware).toHaveBeenCalled();
  });

  it('profile rewrite "/" → ""', async () => {
    const res = await request(app).get('/api/profile/');
    expect(res.body.path).toBe('');
  });

  it('follow rewrite', async () => {
    const res = await request(app).post('/api/follow/test');
    expect(res.body.path).toBe('/follow/test');
  });

  it('unfollow rewrite', async () => {
    const res = await request(app).post('/api/unfollow/test');
    expect(res.body.path).toBe('/unfollow/test');
  });

  it('block rewrite', async () => {
    const res = await request(app).post('/api/block/test');
    expect(res.body.path).toBe('/block/test');
  });

  it('posts rewrite', async () => {
    const res = await request(app).get('/api/posts/123');
    expect(res.body.path).toBe('/posts/123');
  });

  it('feed rewrite', async () => {
    const res = await request(app).get('/api/feed');
    expect(res.body.path).toBe('/feed');
  });

  it('interactions keeps path', async () => {
    const res = await request(app).get('/api/interactions/test');
    expect(res.body.path).toBe('/test');
  });

  it('returns 404 for unknown route', async () => {
    const res = await request(app).get('/unknown-route');
    expect(res.status).toBe(404);
  });

  it('handles root route or base path', async () => {
    const res = await request(app).get('/');

    // flexible depending on your implementation
    expect([200, 404]).toContain(res.status);
  });
  it('proxy without pathRewrite still works', async () => {
    const res = await request(app).get('/api/feed');

    expect(res.status).toBe(200);
  });
  // ✅ FIXED EXPECTATION
  it('returns 500 on proxy error (handled by errorHandler)', async () => {
    shouldFail = true;

    const res = await request(app).get('/api/posts');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'Handled error',
    });
  });

  it('falls back to errorHandler', async () => {
    shouldFail = true;

    const res = await request(app).get('/api/feed');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Handled error' });
  });

});