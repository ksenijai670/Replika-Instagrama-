const db = require('../config/db');

const FollowModel = {

    // kreira follow relaciju
  async createFollow(followerId, followingId, status) {
    const query = `
      INSERT INTO follows (follower_id, following_id, status)
      VALUES (?, ?, ?)
    `;
    return db.query(query, [followerId, followingId, status]);
  },
     //da li vec postoji follow relacija izmedju korisnika
  async findFollow(followerId, followingId) {
    const query = `
      SELECT * FROM follows
      WHERE follower_id = ? AND following_id = ?
      LIMIT 1
    `;
    const [rows] = await db.query(query, [followerId, followingId]);
    return rows[0] || null;
  },
      //prihvatanje zahteva (za privatne profile)
  async acceptPendingFollow(followerId, followingId) {
    const query = `
      UPDATE follows
      SET status = 'ACCEPTED'
      WHERE follower_id = ? AND following_id = ? AND status = 'PENDING'
    `;
    const [result] = await db.query(query, [followerId, followingId]);
    return result;
  },
      //odbijanje zahteva (za privatne profile)
  async rejectPendingFollow(followerId, followingId) {
    const query = `
      DELETE FROM follows
      WHERE follower_id = ? AND following_id = ? AND status = 'PENDING'
    `;
    const [result] = await db.query(query, [followerId, followingId]);
    return result;
  },
      //brise follow relaciju
  async deleteFollow(followerId, followingId) {
    const query = `
      DELETE FROM follows
      WHERE follower_id = ? AND following_id = ?
    `;
    const [result] = await db.query(query, [followerId, followingId]);
    return result;
  },
       //lista zahteva za nekog korisnika
  async getPendingRequests(userId) {
    const query = `
      SELECT follower_id, created_at
      FROM follows
      WHERE following_id = ? AND status = 'PENDING'
      ORDER BY created_at DESC
    `;
    const [rows] = await db.query(query, [userId]);
    return rows;
  },
       //pravi block relaciju
  async createBlock(blockerId, blockedId) {
    const query = `
      INSERT INTO blocks (blocker_id, blocked_id)
      VALUES (?, ?)
    `;
    return db.query(query, [blockerId, blockedId]);
  },
        //provera blok relacije izmedju korisnika
  async isBlocked(userA, userB) {
    const query = `
      SELECT 1
      FROM blocks
      WHERE (blocker_id = ? AND blocked_id = ?)
         OR (blocker_id = ? AND blocked_id = ?)
      LIMIT 1
    `;
    const [rows] = await db.query(query, [userA, userB, userB, userA]);
    return rows.length > 0;
  },

    //odblokiranje
  async deleteBlock(blockerId, blockedId) {
    const query = `
      DELETE FROM blocks
      WHERE blocker_id = ? AND blocked_id = ?
    `;
    const [result] = await db.query(query, [blockerId, blockedId]);
    return result;
  },
      //brisanje follow relacija nakon blokiranja
  async removeFollowsOnBlock(userA, userB) {
    const query = `
      DELETE FROM follows
      WHERE (follower_id = ? AND following_id = ?)
         OR (follower_id = ? AND following_id = ?)
    `;
    return db.query(query, [userA, userB, userB, userA]);
  },

    //vraca listu blokiranih
  async getBlockedList(blockerId) {
    const query = `
      SELECT blocked_id AS userId
      FROM blocks
      WHERE blocker_id = ?
      ORDER BY created_at DESC
    `;
    const [rows] = await db.query(query, [blockerId]);
    return rows.map(r => r.userId);
  },
     //broj followers i following korisnika
  async getFollowStats(userId) {
    const followersQuery = `
      SELECT COUNT(*) AS count
      FROM follows
      WHERE following_id = ? AND status = 'ACCEPTED'
    `;

    const followingQuery = `
      SELECT COUNT(*) AS count
      FROM follows
      WHERE follower_id = ? AND status = 'ACCEPTED'
    `;

    const [followers] = await db.query(followersQuery, [userId]);
    const [following] = await db.query(followingQuery, [userId]);

    return {
      followers: followers[0].count,
      following: following[0].count
    };
  },

        // Lista korisnika koje userId prati
  async getFollowingList(userId) {
    const query = `
      SELECT following_id AS userId
      FROM follows
      WHERE follower_id = ? AND status = 'ACCEPTED'
      ORDER BY created_at DESC
    `;
    const [rows] = await db.query(query, [userId]);
    return rows.map(r => r.userId);
  },

      // Lista pratilaca korisnikaa
  async getFollowersList(userId) {
    const query = `
      SELECT follower_id AS userId
      FROM follows
      WHERE following_id = ? AND status = 'ACCEPTED'
      ORDER BY created_at DESC
    `;
    const [rows] = await db.query(query, [userId]);
    return rows.map(r => r.userId);
  },
        //vraca status follow relacije dva korisnika
  async getFollowStatus(followerId, followingId) {
    const query = `
      SELECT status
      FROM follows
      WHERE follower_id = ? AND following_id = ?
      LIMIT 1
    `;
    const [rows] = await db.query(query, [followerId, followingId]);
    return rows[0]?.status || 'NONE';
  }
};

module.exports = FollowModel;