require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const { searchUsers, getUserInfo, getFollowers, getFollowing, updateUserProfile } = require('./ProfileModel');

const app = express();
app.use(express.json());

// ─── Auth middleware ──────────────────────────────────────
const authMiddleware = (req, res, next) => {
  // Prvo proveravamo da li je prosleđen x-user-id (novi, mikroservisni način)
  const userId = req.headers['x-user-id'];
  
  if (userId) {
    req.user = {
      userId: parseInt(userId),
      username: req.headers['x-username'] || '',
    };
    return next(); // Pusti zahtev dalje!
  }

  // Ako nema x-user-id, probamo stari način sa tokenom
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token or x-user-id' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded;
    return next(); // OVO JE FALILO KOD ALEKSE! Zato je tebi visilo učitavanje!
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// ─── Health ───────────────────────────────────────────────
app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'profile' })
);

// ─── Search ───────────────────────────────────────────────
app.get('/search', authMiddleware, async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length === 0) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  if (q.trim().length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  try {
    const users = await searchUsers(q.trim(), req.user.userId);
    return res.status(200).json({ users });
  } catch (err) {
    console.error('[Search] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── User Info ────────────────────────────────────────────
app.get('/users/:userId', authMiddleware, async (req, res) => {
  const targetUserId = parseInt(req.params.userId);

  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const token = req.headers['authorization']?.split(' ')[1] || '';
    const result = await getUserInfo(targetUserId, req.user.userId, token);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(200).json({ user: result.data });
  } catch (err) {
    console.error('[UserInfo] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Followers list ───────────────────────────────────────
app.get('/users/:userId/followers', authMiddleware, async (req, res) => {
  const targetUserId = parseInt(req.params.userId);

  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const result = await getFollowers(targetUserId, req.user.userId);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(200).json({ followers: result.data });
  } catch (err) {
    console.error('[Followers] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Following list ───────────────────────────────────────
app.get('/users/:userId/following', authMiddleware, async (req, res) => {
  const targetUserId = parseInt(req.params.userId);

  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const result = await getFollowing(targetUserId, req.user.userId);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(200).json({ following: result.data });
  } catch (err) {
    console.error('[Following] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/users/me', authMiddleware, async (req, res) => {
  const { first_name, last_name, bio, profile_image_url } = req.body;
  try {
    await updateUserProfile(req.user.userId, first_name, last_name, bio, profile_image_url);
    return res.status(200).json({ message: 'Profil uspesno azuriran' });
  } catch (err) {
    console.error('[UpdateProfile] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
module.exports = app;