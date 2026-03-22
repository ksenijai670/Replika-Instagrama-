const express = require('express');
const { getFeed } = require('./FeedModel');

const app = express();
app.use(express.json());

// ─── Auth middleware ──────────────────────────────────────
const authMiddleware = (req, res, next) => {
  const userId = req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = {
    userId: parseInt(userId),
    username: req.headers['x-username'] || '',
  };

  next();
};

// ─── Health ───────────────────────────────────────────────
app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'feed' })
);

// ─── Feed ─────────────────────────────────────────────────
app.get('/feed', authMiddleware, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 20, 100);
  const offset = Math.max(parseInt(req.query.offset) || 0,  0);
  
  // NOVO: Izvlačimo token iz headera i šaljemo ga u getFeed
  const token = req.headers['authorization']?.split(' ')[1] || '';

  try {
    const result = await getFeed(req.user.userId, limit, offset, token);
    return res.status(200).json({
      posts:       result.data,
      total:       result.total,
      has_more:    result.has_more,
      limit,
      offset,
      next_offset: result.has_more ? offset + limit : null,
    });
  } catch (err) {
    console.error('[Feed] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = app;