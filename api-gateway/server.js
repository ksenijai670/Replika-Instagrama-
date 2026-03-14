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
  allowedHeaders: ['Content-Type', 'Authorization'],
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

app.use('/auth/register',
  authLimiter,
  proxy(SERVICES.auth + '/register')
);

app.use('/auth/login',
  authLimiter,
  proxy(SERVICES.auth + '/login')
);

app.use('/auth/logout',
  authMiddleware,
  proxy(SERVICES.auth, { '^/auth/logout': '/logout' })
);

app.use('/auth/me',
  authMiddleware,
  proxy(SERVICES.auth, { '^/auth/me': '/me' })
);

app.use('/api/authentication/logout',
  authMiddleware,
  proxy(SERVICES.auth, { '^/api/authentication/logout': '/logout' })
);

app.use('/api/authentication/me',
  authMiddleware,
  proxy(SERVICES.auth, { '^/api/authentication/me': '/me' })
);

// Profile — search, user info, followers, following
app.use('/profile',
  authMiddleware,
  proxy(SERVICES.profile, { '^/profile': '' })
);

app.use('/api/profile',
  authMiddleware,
  proxy(SERVICES.profile, { '^/api/profile': '' })
);

// Follow — follow, unfollow, block, notifications
app.use('/follow',
  authMiddleware,
  proxy(SERVICES.follow, { '^/follow': '' })
);

app.use('/api/follow',
  authMiddleware,
  proxy(SERVICES.follow, { '^/api/follow': '' })
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