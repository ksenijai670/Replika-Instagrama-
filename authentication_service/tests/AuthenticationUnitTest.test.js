process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';

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

// Redis mock MUST include .on() because AuthenticationModel calls redis.on('error', ...)
const mockRedisGet     = jest.fn();
const mockRedisSet     = jest.fn();
const mockRedisDel     = jest.fn();
const mockRedisConnect = jest.fn();
const mockRedisOn      = jest.fn();

jest.mock('redis', () => ({
  createClient: () => ({
    on:      mockRedisOn,
    connect: mockRedisConnect,
    get:     mockRedisGet,
    set:     mockRedisSet,
    del:     mockRedisDel,
  }),
}));

jest.mock('bcrypt', () => ({
  hash:    jest.fn(),
  compare: jest.fn(),
}));

const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const request = require('supertest');

/* ══════════════════════════════════════════════════════════
   LOAD MODULES (after mocks are set up)
══════════════════════════════════════════════════════════ */

const {
  hashPassword,
  createUser,
  findUserByIdentifier,
  findUserById,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  getStoredRefreshToken,
  updateUser,
  softDeleteUser,
  blacklistAccessToken,
  deleteRefreshToken,
  isTokenBlacklisted,
} = require('../AuthenticationModel');

const app = require('../AuthenticationController');

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */

const makeAccessToken = (payload = { userId: 1, username: 'testuser' }) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });

const makeRefreshToken = (payload = { userId: 1 }) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

const authHeader = () => ({ Authorization: `Bearer ${makeAccessToken()}` });

const mockUser = {
  id: 1,
  first_name: 'John',
  last_name:  'Doe',
  username:   'johndoe',
  email:      'john@example.com',
  password_hash: 'hashed_password',
  bio:            null,
  profile_image_url: null,
  is_private:     1,
};

/* ══════════════════════════════════════════════════════════
   AuthenticationModel
══════════════════════════════════════════════════════════ */

describe('AuthenticationModel', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── hashPassword ─────────────────────────────────────
  describe('hashPassword', () => {
    it('should return a hashed password', async () => {
      bcrypt.hash.mockResolvedValue('hashed');
      expect(await hashPassword('password123')).toBe('hashed');
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
    });

    it('should throw if bcrypt fails', async () => {
      bcrypt.hash.mockRejectedValue(new Error('bcrypt error'));
      await expect(hashPassword('password')).rejects.toThrow('bcrypt error');
    });
  });

  // ─── verifyPassword ───────────────────────────────────
  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      bcrypt.compare.mockResolvedValue(true);
      expect(await verifyPassword('pass', 'hash')).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      bcrypt.compare.mockResolvedValue(false);
      expect(await verifyPassword('wrong', 'hash')).toBe(false);
    });
  });

  // ─── createUser ───────────────────────────────────────
  describe('createUser', () => {
    it('should insert a new user', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      await createUser('John', 'Doe', 'johndoe', 'j@x.com', 'hash', 'bio');
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('should pass null for bio when not provided', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      await createUser('John', 'Doe', 'johndoe', 'j@x.com', 'hash');
      const callArgs = mockExecute.mock.calls[0][1];
      expect(callArgs[5]).toBeNull();
    });

    it('should throw ER_DUP_ENTRY if user exists', async () => {
      const err = new Error('Dup'); err.code = 'ER_DUP_ENTRY';
      mockExecute.mockRejectedValueOnce(err);
      await expect(createUser('J', 'D', 'u', 'e@e.com', 'h'))
        .rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    });

    it('should throw on DB error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('DB error'));
      await expect(createUser('J', 'D', 'u', 'e@e.com', 'h')).rejects.toThrow('DB error');
    });
  });

  // ─── findUserByIdentifier ─────────────────────────────
  describe('findUserByIdentifier', () => {
    it('should return user when found', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      expect(await findUserByIdentifier('johndoe')).toEqual(mockUser);
    });

    it('should return null when not found', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      expect(await findUserByIdentifier('unknown')).toBeNull();
    });

    it('should throw on DB error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('DB error'));
      await expect(findUserByIdentifier('johndoe')).rejects.toThrow('DB error');
    });
  });

  // ─── findUserById ─────────────────────────────────────
  describe('findUserById', () => {
    it('should return user when found', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      expect(await findUserById(1)).toEqual(mockUser);
    });

    it('should return null when not found', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      expect(await findUserById(999)).toBeNull();
    });

    it('should throw on DB error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('DB error'));
      await expect(findUserById(1)).rejects.toThrow('DB error');
    });
  });

  // ─── generateAccessToken ──────────────────────────────
  describe('generateAccessToken', () => {
    it('should return a signed JWT with userId and username', () => {
      const token   = generateAccessToken(mockUser);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.username).toBe(mockUser.username);
    });

    it('should use camelCase fields if snake_case are absent', () => {
      const user = { id: 2, username: 'u', firstName: 'A', lastName: 'B', avatar: 'img.jpg' };
      const token   = generateAccessToken(user);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded.firstName).toBe('A');
      expect(decoded.avatar).toBe('img.jpg');
    });
  });

  // ─── generateRefreshToken ─────────────────────────────
  describe('generateRefreshToken', () => {
    it('should return a signed JWT with userId', () => {
      const token   = generateRefreshToken(mockUser);
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
      expect(decoded.userId).toBe(mockUser.id);
    });
  });

  // ─── storeRefreshToken ────────────────────────────────
  describe('storeRefreshToken', () => {
    it('should store token in Redis with 7-day TTL', async () => {
      mockRedisSet.mockResolvedValue('OK');
      await storeRefreshToken(1, 'tok');
      expect(mockRedisSet).toHaveBeenCalledWith(
        'refresh:1', 'tok', { EX: 7 * 24 * 60 * 60 }
      );
    });

    it('should throw if Redis fails', async () => {
      mockRedisSet.mockRejectedValueOnce(new Error('Redis error'));
      await expect(storeRefreshToken(1, 'tok')).rejects.toThrow('Redis error');
    });
  });

  // ─── getStoredRefreshToken ────────────────────────────
  describe('getStoredRefreshToken', () => {
    it('should return the stored token', async () => {
      mockRedisGet.mockResolvedValue('stored_tok');
      expect(await getStoredRefreshToken(1)).toBe('stored_tok');
      expect(mockRedisGet).toHaveBeenCalledWith('refresh:1');
    });

    it('should return null when not found', async () => {
      mockRedisGet.mockResolvedValue(null);
      expect(await getStoredRefreshToken(99)).toBeNull();
    });
  });

  // ─── updateUser ───────────────────────────────────────
  describe('updateUser', () => {
    it('should update allowed fields and return updated: true', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      expect(await updateUser(1, { first_name: 'Jane' })).toEqual({ updated: true });
    });

    it('should return updated: false for empty fields object', async () => {
      expect(await updateUser(1, {})).toEqual({ updated: false });
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should return updated: false when all fields are disallowed', async () => {
      expect(await updateUser(1, { username: 'x', email: 'x@x.com' }))
        .toEqual({ updated: false });
    });

    it('should update bio to empty string', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      expect(await updateUser(1, { bio: '' })).toEqual({ updated: true });
    });

    it('should update is_private field', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      expect(await updateUser(1, { is_private: 0 })).toEqual({ updated: true });
    });

    it('should update profile_image_url field', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      expect(await updateUser(1, { profile_image_url: 'http://img' })).toEqual({ updated: true });
    });

    it('should update password_hash field', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      expect(await updateUser(1, { password_hash: 'new_hash' })).toEqual({ updated: true });
    });

    it('should return updated: false when affectedRows is 0', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      expect(await updateUser(1, { first_name: 'Jane' })).toEqual({ updated: false });
    });

    it('should throw on DB error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('DB error'));
      await expect(updateUser(1, { first_name: 'Jane' })).rejects.toThrow('DB error');
    });
  });

  // ─── softDeleteUser ───────────────────────────────────
  describe('softDeleteUser', () => {
    it('should set deleted_at on the user', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      await softDeleteUser(1);
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('should throw on DB error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('DB error'));
      await expect(softDeleteUser(1)).rejects.toThrow('DB error');
    });
  });

  // ─── blacklistAccessToken ─────────────────────────────
  describe('blacklistAccessToken', () => {
    it('should store token in Redis blacklist with TTL when exp > 0', async () => {
      mockRedisSet.mockResolvedValue('OK');
      await blacklistAccessToken('some_token', 900);
      expect(mockRedisSet).toHaveBeenCalledWith('blacklist:some_token', 'true', { EX: 900 });
    });

    it('should NOT store token when exp <= 0', async () => {
      await blacklistAccessToken('some_token', 0);
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('should NOT store token when exp is negative', async () => {
      await blacklistAccessToken('some_token', -10);
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('should throw if Redis fails', async () => {
      mockRedisSet.mockRejectedValueOnce(new Error('Redis error'));
      await expect(blacklistAccessToken('token', 900)).rejects.toThrow('Redis error');
    });
  });

  // ─── deleteRefreshToken ───────────────────────────────
  describe('deleteRefreshToken', () => {
    it('should delete token from Redis', async () => {
      mockRedisDel.mockResolvedValue(1);
      await deleteRefreshToken(1);
      expect(mockRedisDel).toHaveBeenCalledWith('refresh:1');
    });

    it('should throw if Redis fails', async () => {
      mockRedisDel.mockRejectedValueOnce(new Error('Redis error'));
      await expect(deleteRefreshToken(1)).rejects.toThrow('Redis error');
    });
  });

  // ─── isTokenBlacklisted ───────────────────────────────
  describe('isTokenBlacklisted', () => {
    it('should return "true" string if token is blacklisted', async () => {
      mockRedisGet.mockResolvedValue('true');
      expect(await isTokenBlacklisted('tok')).toBe('true');
    });

    it('should return null if token is not blacklisted', async () => {
      mockRedisGet.mockResolvedValue(null);
      expect(await isTokenBlacklisted('tok')).toBeNull();
    });

    it('should throw if Redis fails', async () => {
      mockRedisGet.mockRejectedValueOnce(new Error('Redis error'));
      await expect(isTokenBlacklisted('tok')).rejects.toThrow('Redis error');
    });
  });

  // ─── Redis 'error' event handler (line 19) ──────────────
  // The anonymous function `err => console.error('Redis Error:', err)` passed to
  // redis.on('error', ...) is called at module load time.
  // We capture the callback before any beforeEach clears mock history.
  describe("Redis error event handler", () => {
    // Capture at describe() evaluation time — before beforeEach runs
    const redisErrorCall = mockRedisOn.mock.calls.find(c => c[0] === 'error');
    const redisErrorCallback = redisErrorCall ? redisErrorCall[1] : null;

    it('should invoke the error callback registered with redis.on', () => {
      expect(redisErrorCallback).toBeDefined();
      // Calling the callback covers the anonymous function on line 19
      expect(() => redisErrorCallback(new Error('Redis test error'))).not.toThrow();
    });
  });

  // ─── getStoredRefreshToken (ensure coverage after resetModules) ───
  describe('getStoredRefreshToken direct', () => {
    it('should retrieve stored token', async () => {
      const { getStoredRefreshToken } = require('../AuthenticationModel');
      mockRedisGet.mockResolvedValueOnce('tok123');
      expect(await getStoredRefreshToken(5)).toBe('tok123');
    });
  });

  // ─── softDeleteUser (ensure coverage after resetModules) ────────
  describe('softDeleteUser direct', () => {
    it('should call execute to soft delete', async () => {
      const { softDeleteUser } = require('../AuthenticationModel');
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      await softDeleteUser(1);
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Redis connect (production branch) ────────────────
  // Covers the `if (process.env.NODE_ENV !== 'test') redis.connect()` branch
  describe('Redis connection in production mode', () => {
    it('should call redis.connect when NODE_ENV is not test', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      jest.resetModules();

      // Re-register mocks after resetModules
      jest.mock('mysql2/promise', () => ({
        createPool: () => ({ execute: jest.fn() }),
      }));
      jest.mock('redis', () => ({
        createClient: () => ({
          on:      jest.fn(),
          connect: mockRedisConnect,
          get:     jest.fn(),
          set:     jest.fn(),
          del:     jest.fn(),
        }),
      }));
      jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

      require('../AuthenticationModel');
      expect(mockRedisConnect).toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });
  });
});

/* ══════════════════════════════════════════════════════════
   AuthenticationController
══════════════════════════════════════════════════════════ */

describe('AuthenticationController', () => {
  beforeEach(() => {
    // resetAllMocks clears both call history AND queued Once implementations
    // preventing mock queue leakage between tests
    jest.resetAllMocks();
    // Default: tokens are not blacklisted — individual tests override as needed
    mockRedisGet.mockResolvedValue(null);
  });

  // ─── authMiddleware — x-user-id path ──────────────────
  describe('authMiddleware via x-user-id header', () => {
    it('should accept x-user-id header and set req.user', async () => {
      // GET /me uses authMiddleware — use x-user-id to trigger that branch
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      const res = await request(app)
        .get('/me')
        .set('x-user-id', '1')
        .set('x-username', 'johndoe');
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('johndoe');
    });

    it('should reject non-numeric x-user-id and fall through to Bearer check', async () => {
      // x-user-id = 'abc' → isNaN → falls through → no Bearer → 401
      const res = await request(app).get('/me').set('x-user-id', 'abc');
      expect(res.status).toBe(401);
    });
  });

  // ─── authMiddleware — Bearer token path ───────────────
  describe('authMiddleware via Bearer token', () => {
    it('should return 401 if token is blacklisted', async () => {
      mockRedisGet.mockResolvedValue('true');
      const res = await request(app).get('/me').set(authHeader());
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Token revoked');
    });

    it('should return 401 if token is invalid', async () => {
      mockRedisGet.mockResolvedValue(null);
      const res = await request(app)
        .get('/me')
        .set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid or expired token');
    });
  });

  // ─── POST /register ───────────────────────────────────
  describe('POST /register', () => {
    it('should return 400 if any required field is missing', async () => {
      const res = await request(app).post('/register').send({ firstName: 'John' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('All fields required');
    });

    it('should return 201 on successful registration', async () => {
      bcrypt.hash.mockResolvedValue('hashed');
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).post('/register').send({
        firstName: 'John', lastName: 'Doe',
        username: 'johndoe', email: 'john@example.com', password: 'pass123',
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('User registered');
    });

    it('should return 201 with optional bio', async () => {
      bcrypt.hash.mockResolvedValue('hashed');
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).post('/register').send({
        firstName: 'John', lastName: 'Doe',
        username: 'johndoe2', email: 'j2@x.com', password: 'pass', bio: 'My bio',
      });
      expect(res.status).toBe(201);
    });

    it('should return 409 if user already exists (ER_DUP_ENTRY)', async () => {
      bcrypt.hash.mockResolvedValue('hashed');
      const err = new Error('Dup'); err.code = 'ER_DUP_ENTRY';
      mockExecute.mockRejectedValueOnce(err);
      const res = await request(app).post('/register').send({
        firstName: 'John', lastName: 'Doe',
        username: 'johndoe', email: 'john@example.com', password: 'pass',
      });
      expect(res.status).toBe(409);
    });

    it('should return 500 on generic DB error', async () => {
      bcrypt.hash.mockResolvedValue('hashed');
      mockExecute.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).post('/register').send({
        firstName: 'John', lastName: 'Doe',
        username: 'johndoe', email: 'john@example.com', password: 'pass',
      });
      expect(res.status).toBe(500);
    });

    it('should return 500 if bcrypt fails', async () => {
      bcrypt.hash.mockRejectedValue(new Error('bcrypt fail'));
      const res = await request(app).post('/register').send({
        firstName: 'John', lastName: 'Doe',
        username: 'johndoe', email: 'john@example.com', password: 'pass',
      });
      expect(res.status).toBe(500);
    });
  });

  // ─── POST /login ──────────────────────────────────────
  describe('POST /login', () => {
    it('should return 401 if user not found', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      const res = await request(app).post('/login').send({ identifier: 'x', password: 'y' });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('should return 401 if password is wrong', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      bcrypt.compare.mockResolvedValue(false);
      const res = await request(app).post('/login').send({ identifier: 'johndoe', password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('should return 200 with accessToken and refreshToken on success', async () => {
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      bcrypt.compare.mockResolvedValue(true);
      mockRedisSet.mockResolvedValue('OK');
      const res = await request(app).post('/login').send({ identifier: 'johndoe', password: 'pass' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('should return 500 on DB error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).post('/login').send({ identifier: 'johndoe', password: 'pass' });
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Login failed');
    });
  });

  // ─── POST /refresh ────────────────────────────────────
  describe('POST /refresh', () => {
    it('should return 400 if refreshToken is missing', async () => {
      const res = await request(app).post('/refresh').send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Refresh token required');
    });

    it('should return 403 if refreshToken is invalid/expired', async () => {
      const res = await request(app).post('/refresh').send({ refreshToken: 'bad_token' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Refresh failed');
    });

    it('should return 403 if stored token does not match', async () => {
      const rfToken = makeRefreshToken();
      mockRedisGet.mockResolvedValue('different_token');
      const res = await request(app).post('/refresh').send({ refreshToken: rfToken });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Invalid refresh token');
    });

    it('should return 404 if user not found after token match', async () => {
      const rfToken = makeRefreshToken();
      mockRedisGet.mockResolvedValue(rfToken);
      mockExecute.mockResolvedValueOnce([[]]);
      const res = await request(app).post('/refresh').send({ refreshToken: rfToken });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('User not found');
    });

    it('should return 200 with new accessToken on success', async () => {
      const rfToken = makeRefreshToken();
      mockRedisGet.mockResolvedValue(rfToken);
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      const res = await request(app).post('/refresh').send({ refreshToken: rfToken });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
    });
  });

  // ─── POST /logout ─────────────────────────────────────
  describe('POST /logout', () => {
    it('should return 401 if not authenticated', async () => {
      const res = await request(app).post('/logout');
      expect(res.status).toBe(401);
    });

    it('should return 200 on successful logout without refresh token', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');
      const res = await request(app).post('/logout').set(authHeader()).send({});
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out');
      expect(mockRedisSet).toHaveBeenCalled(); // blacklistAccessToken called
    });

    it('should delete refresh token when provided with valid userId', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');
      mockRedisDel.mockResolvedValue(1);
      const res = await request(app)
        .post('/logout')
        .set(authHeader())
        .send({ refreshToken: makeRefreshToken() });
      expect(res.status).toBe(200);
      expect(mockRedisDel).toHaveBeenCalledWith('refresh:1');
    });

    it('should skip refresh deletion if refresh token payload has no userId', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');
      const noUserIdRefresh = jwt.sign({ foo: 'bar' }, process.env.JWT_REFRESH_SECRET);
      const res = await request(app)
        .post('/logout')
        .set(authHeader())
        .send({ refreshToken: noUserIdRefresh });
      expect(res.status).toBe(200);
      expect(mockRedisDel).not.toHaveBeenCalled();
    });

    it('should return 200 even without Authorization header when x-user-id is set (no token to blacklist)', async () => {
      // When authenticated via x-user-id, req.headers.authorization is undefined
      // so the `if (token)` branch in logout is false — blacklist is skipped
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]); // not needed but safe
      const res = await request(app)
        .post('/logout')
        .set('x-user-id', '1')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out');
      expect(mockRedisSet).not.toHaveBeenCalled(); // no token to blacklist
    });

    it('should return 500 on Redis error during blacklisting', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockRejectedValueOnce(new Error('Redis error'));
      const res = await request(app).post('/logout').set(authHeader()).send({});
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Logout error');
    });
  });

  // ─── GET /me ──────────────────────────────────────────
  describe('GET /me', () => {
    it('should return 401 if not authenticated', async () => {
      const res = await request(app).get('/me');
      expect(res.status).toBe(401);
    });

    it('should return 404 if user not found', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValueOnce([[]]);
      const res = await request(app).get('/me').set(authHeader());
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('User not found');
    });

    it('should return 200 with user data', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      const res = await request(app).get('/me').set(authHeader());
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('johndoe');
    });

    it('should return 500 on DB error', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).get('/me').set(authHeader());
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error fetching user');
    });
  });

  // ─── PATCH /me ────────────────────────────────────────
  describe('PATCH /me', () => {
    it('should return 401 if not authenticated', async () => {
      const res = await request(app).patch('/me').send({ firstName: 'Jane' });
      expect(res.status).toBe(401);
    });

    it('should return 200 with "Updated" on successful field change', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).patch('/me').set(authHeader())
        .send({ firstName: 'Jane', lastName: 'Smith' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Updated');
    });

    it('should return 200 with "No changes" when nothing was updated', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      const res = await request(app).patch('/me').set(authHeader())
        .send({ firstName: 'Jane' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('No changes');
    });

    it('should update bio to empty string', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).patch('/me').set(authHeader()).send({ bio: '' });
      expect(res.status).toBe(200);
    });

    it('should update isPrivate to false (maps to is_private = 0)', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).patch('/me').set(authHeader()).send({ isPrivate: false });
      expect(res.status).toBe(200);
    });

    it('should update isPrivate to true (maps to is_private = 1)', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).patch('/me').set(authHeader()).send({ isPrivate: true });
      expect(res.status).toBe(200);
    });

    it('should update profileImageUrl', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).patch('/me').set(authHeader())
        .send({ profileImageUrl: 'http://img.jpg' });
      expect(res.status).toBe(200);
    });

    it('should return 400 if password provided without currentPassword', async () => {
      mockRedisGet.mockResolvedValue(null);
      const res = await request(app).patch('/me').set(authHeader())
        .send({ password: 'newpass' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Current password required');
    });

    it('should return 404 if user not found during password change', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValueOnce([[]]);
      const res = await request(app).patch('/me').set(authHeader())
        .send({ password: 'newpass', currentPassword: 'oldpass' });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('User not found');
    });

    it('should return 401 if currentPassword is incorrect', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      bcrypt.compare.mockResolvedValue(false);
      const res = await request(app).patch('/me').set(authHeader())
        .send({ password: 'newpass', currentPassword: 'wrongpass' });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Incorrect current password');
    });

    it('should return 200 on successful password change', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValueOnce([[mockUser]]);
      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('new_hashed');
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).patch('/me').set(authHeader())
        .send({ password: 'newpass', currentPassword: 'oldpass' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Updated');
    });

    it('should return 500 on DB error', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).patch('/me').set(authHeader())
        .send({ firstName: 'Jane' });
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Update error');
    });
  });
});

/* ══════════════════════════════════════════════════════════
   AuthenticationServer
══════════════════════════════════════════════════════════ */

describe('AuthenticationServer', () => {
  it('should start and listen on a port', (done) => {
    const server   = require('../AuthenticationController');
    const instance = server.listen(0, () => {
      expect(instance.listening).toBe(true);
      instance.close(done);
    });
  });
});