'use strict';

describe('config/services', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  it('returns default URLs when env vars are absent', () => {
    delete process.env.AUTH_SERVICE_URL;
    delete process.env.PROFILE_SERVICE_URL;
    delete process.env.FOLLOW_SERVICE_URL;
    delete process.env.POST_SERVICE_URL;
    delete process.env.INTERACTIONS_SERVICE_URL;
    delete process.env.FEED_SERVICE_URL;

    const services = require('../config/services');
    expect(services.auth).toBe('http://authentication:3001');
    expect(services.profile).toBe('http://profile:3010');
    expect(services.follow).toBe('http://follow-service:3004');
    expect(services.post).toBe('http://post-service:3006');
    expect(services.interactions).toBe('http://interactions-service:3005');
    expect(services.feed).toBe('http://feed:3015');
  });

  it('uses env vars when provided', () => {
    process.env.AUTH_SERVICE_URL = 'http://auth:9001';
    process.env.PROFILE_SERVICE_URL = 'http://profile:9010';
    process.env.FOLLOW_SERVICE_URL = 'http://follow:9004';
    process.env.POST_SERVICE_URL = 'http://posts:9006';
    process.env.INTERACTIONS_SERVICE_URL = 'http://interactions:9005';
    process.env.FEED_SERVICE_URL = 'http://feed:9015';

    jest.resetModules();
    const services = require('../config/services');

    expect(services.auth).toBe('http://auth:9001');
    expect(services.profile).toBe('http://profile:9010');
    expect(services.follow).toBe('http://follow:9004');
    expect(services.post).toBe('http://posts:9006');
    expect(services.interactions).toBe('http://interactions:9005');
    expect(services.feed).toBe('http://feed:9015');
  });
});
