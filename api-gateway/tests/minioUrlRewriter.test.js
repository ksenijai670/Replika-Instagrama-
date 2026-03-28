'use strict';

const minioUrlRewriter = require('../middleware/minioUrlRewriter');

function buildRes() {
  const res = {
    _jsonCalled: null,
    _sendCalled: null,
    json: null,
    send: null,
  };
  res.json = jest.fn(function (body) { res._jsonCalled = body; });
  res.send = jest.fn(function (body) { res._sendCalled = body; });
  return res;
}

describe('minioUrlRewriter', () => {
  let req, next;

  beforeEach(() => {
    req = {};
    next = jest.fn();
  });

  it('calls next()', () => {
    const res = buildRes();
    minioUrlRewriter(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('rewrites minio URL in a JSON object', () => {
    const res = buildRes();
    minioUrlRewriter(req, res, next);
    res.json({ url: 'http://minio:9000/bucket/file.jpg' });
    expect(res._jsonCalled).toEqual({ url: 'http://localhost:9000/bucket/file.jpg' });
  });

  it('rewrites multiple minio URLs in a JSON object', () => {
    const res = buildRes();
    minioUrlRewriter(req, res, next);
    res.json({
      avatar: 'http://minio:9000/a.jpg',
      cover: 'http://minio:9000/b.jpg',
    });
    expect(res._jsonCalled).toEqual({
      avatar: 'http://localhost:9000/a.jpg',
      cover: 'http://localhost:9000/b.jpg',
    });
  });

  it('leaves JSON objects without minio URL unchanged', () => {
    const res = buildRes();
    minioUrlRewriter(req, res, next);
    res.json({ name: 'Alice' });
    expect(res._jsonCalled).toEqual({ name: 'Alice' });
  });

  it('rewrites minio URL in a string body', () => {
    const res = buildRes();
    minioUrlRewriter(req, res, next);
    res.send('http://minio:9000/bucket/file.jpg');
    expect(res._sendCalled).toBe('http://localhost:9000/bucket/file.jpg');
  });

  it('leaves non-minio strings unchanged', () => {
    const res = buildRes();
    minioUrlRewriter(req, res, next);
    res.send('hello world');
    expect(res._sendCalled).toBe('hello world');
  });

  it('passes through null body unchanged', () => {
    const res = buildRes();
    minioUrlRewriter(req, res, next);
    res.json(null);
    expect(res._jsonCalled).toBeNull();
  });

  it('passes through numeric body unchanged', () => {
    const res = buildRes();
    minioUrlRewriter(req, res, next);
    res.json(42);
    expect(res._jsonCalled).toBe(42);
  });

  it('handles nested object with minio URL', () => {
    const res = buildRes();
    minioUrlRewriter(req, res, next);
    res.json({ user: { avatar: 'http://minio:9000/img.png' } });
    expect(res._jsonCalled).toEqual({ user: { avatar: 'http://localhost:9000/img.png' } });
  });
});
