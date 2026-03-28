'use strict';

const errorHandler = require('../middleware/errorHandler');

describe('errorHandler', () => {
  let req, res, next, consoleSpy;

  beforeEach(() => {
    req = { method: 'GET', path: '/test' };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('uses err.status when present', () => {
    const err = { status: 404, message: 'Not found' };
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
  });

  it('uses err.statusCode when err.status is absent', () => {
    const err = { statusCode: 422, message: 'Unprocessable' };
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unprocessable' });
  });

  it('defaults to 500 when no status code is provided', () => {
    const err = new Error('Something broke');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('hides message for 5xx errors (status >= 500)', () => {
    const err = { status: 503, message: 'Downstream exploded' };
    errorHandler(err, req, res, next);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('exposes message for 4xx errors (status < 500)', () => {
    const err = { status: 400, message: 'Bad request payload' };
    errorHandler(err, req, res, next);
    expect(res.json).toHaveBeenCalledWith({ error: 'Bad request payload' });
  });

  it('logs method and path', () => {
    const err = new Error('oops');
    errorHandler(err, req, res, next);
    expect(consoleSpy).toHaveBeenCalledWith('[Error] GET /test:', 'oops');
  });
});
