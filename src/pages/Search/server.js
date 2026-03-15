require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const SERVICES       = require('./config/services');
const authMiddleware = require('./middleware/authMiddleware');
const { globalLimiter, authLimiter } = require('./middleware/rateLimiter');
const errorHandler   = require('./middleware/errorHandler');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-username'],
  credentials: true,
}));

app.options('*', cors());

app.use(globalLimiter);

const proxy = (target) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    parseReqBody: false,
    on: {
      error: (err, req, res) => {
        console.error(`[Gateway] Proxy error → ${target}:`, err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: 'Service temporarily unavailable' });
        }
      },
    },
  });
  
// ─── Health ───────────────────────────────────────────────
app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'gateway' })
);

//Postoji sansa da ce trebati sve da idu preko /api/authentication
app.use('/api/authentication/register',
  authLimiter,
  proxy(SERVICES.auth + '/register')
);

app.use('/api/authentication/login',
  authLimiter,
  proxy(SERVICES.auth + '/login')
);

app.use('/api/authentication/logout',
  authMiddleware,
  proxy(SERVICES.auth +  '/logout')
);

app.use('/api/authentication/me',
  authMiddleware,
  proxy(SERVICES.auth +  '/me')
);

// Profile — search, user info, followers, following
app.use('/api/profile',
  authMiddleware,
  createProxyMiddleware({
    target: SERVICES.profile,
    changeOrigin: true,
    parseReqBody: false,
    pathRewrite: { '^/api/profile': '' },
    on: {
      error: (err, req, res) => {
        console.error(`[Gateway] Proxy error → ${SERVICES.profile}:`, err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: 'Service temporarily unavailable' });
        }
      },
    },
  })
);

app.use('/profile',
  authMiddleware,
  createProxyMiddleware({
    target: SERVICES.profile,
    changeOrigin: true,
    parseReqBody: false,
    pathRewrite: { '^/profile': '' },
    on: {
      error: (err, req, res) => {
        console.error(`[Gateway] Proxy error → ${SERVICES.profile}:`, err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: 'Service temporarily unavailable' });
        }
      },
    },
  })
);

// Follow — follow, unfollow, block, notifications
app.use(['/api/follow', '/api/unfollow', '/api/block'],
  authMiddleware,
  createProxyMiddleware({
    target: SERVICES.follow,
    changeOrigin: true,
    parseReqBody: false,
    pathRewrite: {
      '^/api/follow': '/follow',
      '^/api/unfollow': '/unfollow',
      '^/api/block': '/block'
    },
    on: {
      error: (err, req, res) => {
        console.error(`[Gateway] Follow Proxy error -> ${SERVICES.follow}:`, err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: 'Follow service temporarily unavailable' });
        }
      },
    },
  })
);
// Posts — kreiranje, brisanje, pregled objava
app.use('/posts',
  authMiddleware,
  proxy(SERVICES.post)
);

app.use('/api/posts',
  authMiddleware,
  proxy(SERVICES.post, { '^/api/posts': '/posts' })
);

// Interactions — lajkovi, komentari
app.use('/interactions',
  authMiddleware,
  proxy(SERVICES.interactions)
);

app.use('/api/interactions',
  authMiddleware,
  proxy(SERVICES.interactions, { '^/api/interactions': '/interactions' })
);

// Feed
app.use('/feed',
  authMiddleware,
  proxy(SERVICES.feed)
);

app.use('/api/feed',
  authMiddleware,
  proxy(SERVICES.feed, { '^/api/feed': '/feed' })
);

// ─── Error handler (mora biti posljednji) ─────────────────
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));

module.exports = app;