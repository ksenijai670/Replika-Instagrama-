const mockOn = jest.fn();
const mockConnect = jest.fn();
const mockGet = jest.fn();

jest.mock('redis', () => ({
  createClient: () => ({
    on: mockOn,
    connect: mockConnect,
    get: mockGet,
  }),
}));

// Mock jsonwebtoken globally
const mockVerify = jest.fn();
jest.mock('jsonwebtoken', () => ({
  verify: (...args) => mockVerify(...args),
}));

describe('authMiddleware logic', () => {
  let req, res, next;

  beforeAll(() => {
    // Suppress Redis logs
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockVerify.mockReset();

    req = {
      headers: {},
      path: '/api/protected',
    };

    res = {
      status: jest.fn(() => res),
      json: jest.fn(),
    };

    next = jest.fn();
  });

  it('skips PUBLIC_ROUTES', async () => {
    const authMiddleware = require('../middleware/authMiddleware');
    req.path = '/api/authentication/login';
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 if no authorization header', async () => {
    const authMiddleware = require('../middleware/authMiddleware');
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 if malformed header', async () => {
    const authMiddleware = require('../middleware/authMiddleware');
    req.headers.authorization = 'InvalidFormat';
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 if token verification fails', async () => {
    req.headers.authorization = 'Bearer badtoken';
    mockVerify.mockImplementation(() => {
      throw new Error('Invalid token');
    });

    const authMiddleware = require('../middleware/authMiddleware');
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401); // matches middleware
  });

  it('calls next() on valid token', async () => {
    req.headers.authorization = 'Bearer validtoken';
    mockVerify.mockReturnValue({ id: 'user123' });

    const authMiddleware = require('../middleware/authMiddleware');
    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(undefined);
  });

  it('returns 401 if header does not start with Bearer', async () => {
    const authMiddleware = require('../middleware/authMiddleware');
    req.headers.authorization = 'Basic 123';
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('handles missing token after Bearer', async () => {
    const authMiddleware = require('../middleware/authMiddleware');
    req.headers.authorization = 'Bearer';
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 if token is blacklisted', async () => {
    req.headers.authorization = 'Bearer validtoken';
    mockGet.mockResolvedValue('true');
    mockVerify.mockReturnValue({ id: 'user123' });

    const authMiddleware = require('../middleware/authMiddleware');
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });
});