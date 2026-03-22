const express = require('express');
const jwt = require('jsonwebtoken');
const model = require('./AuthenticationModel');

const app = express();
app.use(express.json());

// ─── MIDDLEWARE ───────────────────────────────────────────
// Supports both Authorization Bearer token AND x-user-id header (gateway microservice style)
const authMiddleware = async (req, res, next) => {
  // (1) Gateway injects x-user-id after validating the token — accept it directly
  const xUserId = req.headers['x-user-id'];
  if (xUserId && !isNaN(parseInt(xUserId))) {
    req.user = { userId: parseInt(xUserId), username: req.headers['x-username'] || '' };
    return next();
  }

  // (2) Fallback: direct Bearer token auth
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    if (await model.isTokenBlacklisted(token)) {
      return res.status(401).json({ message: 'Token revoked' });
    }
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// ─── RUTE ─────────────────────────────────────────────────

app.post('/register', async (req, res) => {
  const { firstName, lastName, username, email, password } = req.body;
  if (!firstName || !lastName || !username || !email || !password) {
    return res.status(400).json({ message: 'All fields required' });
  }
  try {
    const hash = await model.hashPassword(password);
    await model.createUser(firstName, lastName, username, email, hash);
    res.status(201).json({ message: 'User registered' });
  } catch (err) {
    res.status(err.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ message: 'Error or user exists' });
  }
});

app.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  try {
    const user = await model.findUserByIdentifier(identifier);
    if (!user || !(await model.verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const accessToken = model.generateAccessToken(user);
    const refreshToken = model.generateRefreshToken(user);
    await model.storeRefreshToken(user.id, refreshToken);
    res.json({ accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ message: 'Login failed' });
  }
});

app.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: 'Refresh token required' });
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const stored = await model.getStoredRefreshToken(decoded.userId);
    if (stored !== refreshToken) return res.status(403).json({ message: 'Invalid refresh token' });
    const user = await model.findUserById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const newAccessToken = model.generateAccessToken(user);
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(403).json({ message: 'Refresh failed' });
  }
});

app.post('/logout', authMiddleware, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { refreshToken } = req.body;
  try {
    if (token) {
      const decoded = jwt.decode(token);
      const exp = decoded.exp - Math.floor(Date.now() / 1000);
      await model.blacklistAccessToken(token, exp);
    }
    if (refreshToken) {
      const rfDecoded = jwt.decode(refreshToken);
      if (rfDecoded?.userId) await model.deleteRefreshToken(rfDecoded.userId);
    }
    res.json({ message: 'Logged out' });
  } catch (err) {
    res.status(500).json({ message: 'Logout error' });
  }
});

app.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await model.findUserById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching user' });
  }
});

app.patch('/me', authMiddleware, async (req, res) => {
  const { firstName, lastName, bio, profileImageUrl, isPrivate, password, currentPassword } = req.body;
  const fields = {};

  if (firstName !== undefined) fields.first_name = firstName;
  if (lastName !== undefined) fields.last_name = lastName;
  if (bio !== undefined) fields.bio = bio;
  if (profileImageUrl !== undefined) fields.profile_image_url = profileImageUrl;
  if (isPrivate !== undefined) fields.is_private = isPrivate ? 1 : 0;

  try {
    if (password) {
      if (!currentPassword) return res.status(400).json({ message: 'Current password required' });
      const user = await model.findUserById(req.user.userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      if (!(await model.verifyPassword(currentPassword, user.password_hash))) {
        return res.status(401).json({ message: 'Incorrect current password' });
      }
      fields.password_hash = await model.hashPassword(password);
    }

    const result = await model.updateUser(req.user.userId, fields);
    res.json(result.updated ? { message: 'Updated' } : { message: 'No changes' });
  } catch (err) {
    res.status(500).json({ message: 'Update error' });
  }
});

module.exports = app;