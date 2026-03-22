const jwt = require('jsonwebtoken');
const redis = require('redis');

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

client.on('error', (err) => console.error('Redis error:', err));

(async () => {
  try {
    await client.connect();
    console.log('Gateway connected to Redis');
  } catch (e) {
    console.error('Redis connection failed:', e);
  }
})();

const PUBLIC_ROUTES = [
  '/api/authentication/login',
  '/api/authentication/register',
];

async function isBlacklisted(token) {
  try {
    const reply = await client.get(`blacklist:${token}`);
    return reply === 'true';
  } catch (err) {
    console.error('Redis blacklist check error:', err);
    return false;
  }
}

module.exports = async function authMiddleware(req, res, next) {
  if (PUBLIC_ROUTES.some(route => req.path.startsWith(route))) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  if (await isBlacklisted(token)) {
    return res.status(401).json({ error: 'Token is blacklisted' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.headers['x-user-id'] = String(decoded.userId || decoded.id || '');
    req.headers['x-username'] = String(decoded.username || '');
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};