require('dotenv').config();

module.exports = {
  auth:         process.env.AUTH_SERVICE_URL         || 'http://authentication:3001',
  profile:      process.env.PROFILE_SERVICE_URL      || 'http://profile:3010',
  follow:       process.env.FOLLOW_SERVICE_URL       || 'http://follow-service:3004',
  post:         process.env.POST_SERVICE_URL         || 'http://post-service:3006',
  interactions: process.env.INTERACTIONS_SERVICE_URL || 'http://interactions-service:3005',
  feed:         process.env.FEED_SERVICE_URL         || 'http://feed:3015',
};