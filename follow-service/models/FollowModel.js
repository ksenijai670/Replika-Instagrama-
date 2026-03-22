const db = require('../config/db');

const FollowModel = {

  async createFollow(followerId, followingId, status) {
    const [result] = await db.query(
      `INSERT INTO follows (follower_id, following_id, status) VALUES (?, ?, ?)`,
      [followerId, followingId, status]
    );
    return result;
  },

  async findFollow(followerId, followingId) {
    const [rows] = await db.query(
      `SELECT * FROM follows WHERE follower_id = ? AND following_id = ? LIMIT 1`,
      [followerId, followingId]
    );
    return rows[0] || null;
  },

  async acceptPendingFollow(followerId, followingId) {
    const [result] = await db.query(
      `UPDATE follows SET status = 'ACCEPTED' WHERE follower_id = ? AND following_id = ? AND status = 'PENDING'`,
      [followerId, followingId]
    );
    return result;
  },

  async rejectPendingFollow(followerId, followingId) {
    const [result] = await db.query(
      `DELETE FROM follows WHERE follower_id = ? AND following_id = ? AND status = 'PENDING'`,
      [followerId, followingId]
    );
    return result;
  },

  async deleteFollow(followerId, followingId) {
    const [result] = await db.query(
      `DELETE FROM follows WHERE follower_id = ? AND following_id = ?`,
      [followerId, followingId]
    );
    return result;
  },

  async getPendingRequests(userId) {
    const [rows] = await db.query(
      `SELECT follower_id, created_at FROM follows WHERE following_id = ? AND status = 'PENDING' ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  },

  async createBlock(blockerId, blockedId) {
    return db.query(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?)`,
      [blockerId, blockedId]
    );
  },

  async deleteBlock(blockerId, blockedId) {
    const [result] = await db.query(
      `DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?`,
      [blockerId, blockedId]
    );
    return result;
  },

  async isBlocked(userA, userB) {
    const [rows] = await db.query(
      `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1`,
      [userA, userB, userB, userA]
    );
    return rows.length > 0;
  },

  async removeFollowsOnBlock(userA, userB) {
    return db.query(
      `DELETE FROM follows WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)`,
      [userA, userB, userB, userA]
    );
  },

  // Returns list of user IDs that blockerId has blocked
  async getBlockedList(blockerId) {
    const [rows] = await db.query(
      `SELECT blocked_id AS userId FROM blocks WHERE blocker_id = ? ORDER BY created_at DESC`,
      [blockerId]
    );
    return rows.map(r => r.userId);
  },

  async getFollowStats(userId) {
    const [[followers]] = await db.query(
      `SELECT COUNT(*) AS count FROM follows WHERE following_id = ? AND status = 'ACCEPTED'`,
      [userId]
    );
    const [[following]] = await db.query(
      `SELECT COUNT(*) AS count FROM follows WHERE follower_id = ? AND status = 'ACCEPTED'`,
      [userId]
    );
    return { followers: followers.count, following: following.count };
  },

  async getFollowingList(userId) {
    const [rows] = await db.query(
      `SELECT following_id AS userId FROM follows WHERE follower_id = ? AND status = 'ACCEPTED' ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(r => r.userId);
  },

  async getFollowersList(userId) {
    const [rows] = await db.query(
      `SELECT follower_id AS userId FROM follows WHERE following_id = ? AND status = 'ACCEPTED' ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(r => r.userId);
  },

  async getFollowStatus(followerId, followingId) {
    const [rows] = await db.query(
      `SELECT status FROM follows WHERE follower_id = ? AND following_id = ? LIMIT 1`,
      [followerId, followingId]
    );
    return rows[0]?.status || 'NONE';
  }
};

module.exports = FollowModel;