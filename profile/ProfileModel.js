const mysql = require('mysql2/promise');
const fetch = require('node-fetch');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'rootpassword',
  database: process.env.DB_NAME || 'auth_db',
  waitForConnections: true,
  connectionLimit: 10,
});

const FOLLOW_SERVICE_URL = process.env.FOLLOW_SERVICE_URL || 'http://follow-service:3004';
const POST_SERVICE_URL = process.env.POST_SERVICE_URL || 'http://post-service:3006';

// ─── Follow service helpers ───────────────────────────────

const isBlocked = async (userA, userB) => {
  try {
    const res = await fetch(`${FOLLOW_SERVICE_URL}/blocks/status?userB=${userB}`, {
      headers: { 'x-user-id': String(userA) } // DODATO OVO
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.blocked === true;
  } catch (err) {
    console.error(`[isBlocked] Greška: ${err.message}`);
    return false;
  }
};

const getFollowersCount = async (userId) => {
  try {
    const res = await fetch(`${FOLLOW_SERVICE_URL}/followers/count/${userId}`, {
      headers: { 'x-user-id': String(userId) } // DODATO OVO
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.count ?? 0;
  } catch (err) {
    console.error(`[getFollowersCount] Greška: ${err.message}`);
    return 0;
  }
};

const getFollowingCount = async (userId) => {
  try {
    const res = await fetch(`${FOLLOW_SERVICE_URL}/following/count/${userId}`, {
      headers: { 'x-user-id': String(userId) } // DODATO OVO
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.count ?? 0;
  } catch (err) {
    console.error(`[getFollowingCount] Greška: ${err.message}`);
    return 0;
  }
};

const getIsFollowing = async (requesterId, userId) => {
  try {
    const res = await fetch(`${FOLLOW_SERVICE_URL}/following/status?followerId=${requesterId}&followingId=${userId}`, {
      headers: { 'x-user-id': String(requesterId) } // DODATO OVO
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.isFollowing === true;
  } catch (err) {
    console.error(`[getIsFollowing] Greška: ${err.message}`);
    return false;
  }
};

const getFollowingList = async (userId) => {
  try {
    const res = await fetch(`${FOLLOW_SERVICE_URL}/following/list/${userId}`, {
      headers: { 'x-user-id': String(userId) } // DODATO OVO
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.following || [];
  } catch (err) {
    console.error(`[getFollowingList] Greška: ${err.message}`);
    return [];
  }
};

const getFollowersList = async (userId) => {
  try {
    const res = await fetch(`${FOLLOW_SERVICE_URL}/followers/list/${userId}`, {
      headers: { 'x-user-id': String(userId) } // DODATO OVO
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.followers || [];
  } catch (err) {
    console.error(`[getFollowersList] Greška: ${err.message}`);
    return [];
  }
};

// ─── Post service helpers ─────────────────────────────────

const getPostsByUserId = async (userId) => {
  try {
    // Verovatno i Emi treba x-user-id, pa smo dodali i njoj za svaki slučaj
    const res = await fetch(`${POST_SERVICE_URL}/posts/user/${userId}`, {
      headers: { 'x-user-id': String(userId) }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data || [];
  } catch (err) {
    console.error(`[getPostsByUserId] Greška: ${err.message}`);
    return [];
  }
};

// ─── DB helpers ───────────────────────────────────────────

const getUsersByIds = async (ids) => {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, first_name, last_name, username, profile_image_url
     FROM users
     WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    ids
  );
  return rows;
};

// ─── Search ───────────────────────────────────────────────

const searchUsers = async (query, requesterId) => {
  const like = `%${query}%`;

  const [rows] = await pool.execute(
    `SELECT
       id, first_name, last_name, username, profile_image_url
     FROM users
     WHERE
       deleted_at IS NULL
       AND (first_name LIKE ? OR last_name LIKE ? OR username LIKE ?)
     ORDER BY username ASC
     LIMIT 50`,
    [like, like, like]
  );

  const results = await Promise.all(
    rows.map(async (user) => {
      const blocked = await isBlocked(requesterId, user.id);
      return blocked ? null : user;
    })
  );

  return results.filter(Boolean);
};

// ─── User Info ────────────────────────────────────────────

const getUserInfo = async (userId, requesterId) => {
  const [userRows] = await pool.execute(
    `SELECT
       id, first_name, last_name, username, bio, profile_image_url, is_private, created_at
     FROM users
     WHERE id = ? AND deleted_at IS NULL`,
    [userId]
  );

  if (userRows.length === 0) return { error: 'User not found', status: 404 };

  const user = userRows[0];

  const blocked = await isBlocked(requesterId, userId);
  if (blocked) return { error: 'User not found', status: 404 };

  // Sve paralelno — follow podaci i postovi
  const [
    followers_count,
    following_count,
    is_following,
    posts,
  ] = await Promise.all([
    getFollowersCount(userId),
    getFollowingCount(userId),
    getIsFollowing(requesterId, userId),
    getPostsByUserId(userId),
  ]);

  return {
    data: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      bio: user.bio,
      profile_image_url: user.profile_image_url,
      is_private: user.is_private === 1,
      created_at: user.created_at,
      followers_count,
      following_count,
      is_following,
      posts,
    }
  };
};

// ─── Followers list ───────────────────────────────────────

const getFollowers = async (userId, requesterId) => {
  const blocked = await isBlocked(requesterId, userId);
  if (blocked) return { error: 'User not found', status: 404 };

  const followerIds = await getFollowersList(userId);
  const users = await getUsersByIds(followerIds);

  return { data: users };
};

// ─── Following list ───────────────────────────────────────

const getFollowing = async (userId, requesterId) => {
  const blocked = await isBlocked(requesterId, userId);
  if (blocked) return { error: 'User not found', status: 404 };

  const followingIds = await getFollowingList(userId);
  const users = await getUsersByIds(followingIds);

  return { data: users };
};

module.exports = {
  searchUsers,
  getUserInfo,
  getFollowers,
  getFollowing,
};