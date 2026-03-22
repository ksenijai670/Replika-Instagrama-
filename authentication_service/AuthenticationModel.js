require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const { createClient } = require('redis');

// ─── KONFIGURACIJA ─────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'rootpassword',
  database: process.env.AUTH_DB_NAME || 'user_related_db',
  waitForConnections: true,
  connectionLimit: 10,
});

const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', err => console.error('Redis Error:', err));
if (process.env.NODE_ENV !== 'test') redis.connect();

const USER_FIELDS = 'id, first_name, last_name, username, email, bio, profile_image_url, is_private';

// ─── FUNKCIJE ──────────────────────────────────────────────

const hashPassword = async (password) => await bcrypt.hash(password, 10);
const verifyPassword = async (password, hash) => await bcrypt.compare(password, hash);

const createUser = async (firstName, lastName, username, email, passwordHash, bio) => {
  await pool.execute(
    `INSERT INTO users (first_name, last_name, username, email, password_hash, bio) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [firstName, lastName, username, email, passwordHash, bio ?? null]
  );
};

const findUserByIdentifier = async (identifier) => {
  const [rows] = await pool.execute(
    `SELECT ${USER_FIELDS}, password_hash FROM users WHERE (username=? OR email=? OR id=?) AND deleted_at IS NULL`,
    [identifier, identifier, identifier]
  );
  return rows[0] || null;
};

const findUserById = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT ${USER_FIELDS} FROM users WHERE id = ? AND deleted_at IS NULL`,
    [userId]
  );
  return rows[0] || null;
};

const generateAccessToken = (user) => {
  return jwt.sign(
    { 
      userId: user.id, 
      username: user.username,
      firstName: user.first_name || user.firstName,
      lastName: user.last_name || user.lastName,
      avatar: user.profile_image_url || user.avatar
    },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign({ userId: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
};

const storeRefreshToken = async (userId, refreshToken) => {
  await redis.set(`refresh:${userId}`, refreshToken, { EX: 7 * 24 * 60 * 60 });
};

const getStoredRefreshToken = async (userId) => await redis.get(`refresh:${userId}`);

const updateUser = async (userId, fields) => {
  const allowed = ['first_name', 'last_name', 'bio', 'profile_image_url', 'is_private', 'password_hash'];
  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }

  if (updates.length === 0) return { updated: false };
  values.push(userId);

  const [result] = await pool.execute(
    `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    values
  );
  return { updated: result.affectedRows > 0 };
};

const softDeleteUser = async (userId) => {
  await pool.execute(`UPDATE users SET deleted_at = NOW() WHERE id = ?`, [userId]);
};

const blacklistAccessToken = async (token, exp) => {
  if (exp > 0) await redis.set(`blacklist:${token}`, 'true', { EX: exp });
};

const isTokenBlacklisted = async (token) => await redis.get(`blacklist:${token}`);
const deleteRefreshToken = async (userId) => await redis.del(`refresh:${userId}`);

module.exports = {
  hashPassword, createUser, findUserByIdentifier, findUserById, verifyPassword,
  generateAccessToken, generateRefreshToken, storeRefreshToken, getStoredRefreshToken,
  updateUser, softDeleteUser, blacklistAccessToken, deleteRefreshToken, isTokenBlacklisted,
};