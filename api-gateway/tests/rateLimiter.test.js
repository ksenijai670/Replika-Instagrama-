'use strict';

describe('rateLimiter', () => {

  // ✅ helper to build safe req
  function buildReq(ip = '127.0.0.1', method = 'GET') {
    return {
      ip,
      method,
      headers: {},
      socket: { remoteAddress: ip },
      connection: { remoteAddress: ip },
      app: {
        get: jest.fn().mockReturnValue(false), // 🔥 FIX
      },
    };
  }

  function buildRes() {
    return {
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn(),
    };
  }

  it('exports globalLimiter and authLimiter', () => {
    const { globalLimiter, authLimiter } = require('../middleware/rateLimiter');
    expect(typeof globalLimiter).toBe('function');
    expect(typeof authLimiter).toBe('function');
  });

  it('globalLimiter is an express middleware (length 3)', () => {
    const { globalLimiter } = require('../middleware/rateLimiter');
    expect(globalLimiter.length).toBe(3);
  });

  it('authLimiter is an express middleware (length 3)', () => {
    const { authLimiter } = require('../middleware/rateLimiter');
    expect(authLimiter.length).toBe(3);
  });

  it('globalLimiter calls next for normal requests', (done) => {
    const { globalLimiter } = require('../middleware/rateLimiter');

    const req = buildReq();
    const res = buildRes();

    globalLimiter(req, res, () => {
      done();
    });
  });

  it('authLimiter calls next for normal requests', (done) => {
    const { authLimiter } = require('../middleware/rateLimiter');

    const req = buildReq('10.0.0.1', 'POST');
    const res = buildRes();

    authLimiter(req, res, () => {
      done();
    });
  });

});