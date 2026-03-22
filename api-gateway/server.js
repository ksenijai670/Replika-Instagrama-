require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const SERVICES       = require('./config/services');
const authMiddleware = require('./middleware/authMiddleware');
const { globalLimiter, authLimiter } = require('./middleware/rateLimiter');
const errorHandler   = require('./middleware/errorHandler');
const minioUrlRewriter = require('./middleware/minioUrlRewriter');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-username'],
  credentials: true,
}));

app.options('*', cors());
app.use(globalLimiter);
app.use(minioUrlRewriter);

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

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gateway' }));

// ─── Auth ─────────────────────────────────────────────────
app.use('/api/authentication/register', authLimiter, proxy(SERVICES.auth + '/register'));
app.use('/api/authentication/login',    authLimiter, proxy(SERVICES.auth + '/login'));
app.use('/api/authentication/logout',   authMiddleware, proxy(SERVICES.auth + '/logout'));
app.use('/api/authentication/me',       authMiddleware, proxy(SERVICES.auth + '/me'));

// ─── Profile ──────────────────────────────────────────────
app.use('/api/profile', authMiddleware, createProxyMiddleware({
  target: SERVICES.profile,
  changeOrigin: true,
  parseReqBody: false,
  pathRewrite: (path) => path === '/' ? '' : path,
}));

// ─── Follow service ───────────────────────────────────────
app.use('/api/follow', authMiddleware, createProxyMiddleware({
  target: SERVICES.follow,
  changeOrigin: true,
  parseReqBody: false,
  pathRewrite: (path) => '/follow' + (path === '/' ? '' : path),
}));
app.use('/api/unfollow', authMiddleware, createProxyMiddleware({
  target: SERVICES.follow,
  changeOrigin: true,
  parseReqBody: false,
  pathRewrite: (path) => '/unfollow' + (path === '/' ? '' : path),
}));
app.use('/api/block', authMiddleware, createProxyMiddleware({
  target: SERVICES.follow,
  changeOrigin: true,
  parseReqBody: false,
  pathRewrite: (path) => '/block' + (path === '/' ? '' : path),
}));

// ─── Posts ────────────────────────────────────────────────
app.use('/api/posts', authMiddleware, createProxyMiddleware({
  target: SERVICES.post,
  changeOrigin: true,
  parseReqBody: false,
  pathRewrite: (path) => '/posts' + (path === '/' ? '' : path),
}));

// ─── Interactions ─────────────────────────────────────────
app.use('/api/interactions', authMiddleware, createProxyMiddleware({
  target: SERVICES.interactions,
  changeOrigin: true,
  parseReqBody: false,
  pathRewrite: (path) => path === '/' ? '' : path,
}));

// ─── Feed ─────────────────────────────────────────────────
app.use('/api/feed', authMiddleware, createProxyMiddleware({
  target: SERVICES.feed,
  changeOrigin: true,
  parseReqBody: false,
  pathRewrite: (path) => '/feed' + (path === '/' ? '' : path),
}));

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));

module.exports = app;