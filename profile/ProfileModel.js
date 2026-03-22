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

const FOLLOW_SERVICE_URL        = process.env.FOLLOW_SERVICE_URL        || 'http://follow-service:3004';
const POST_SERVICE_URL          = process.env.POST_SERVICE_URL          || 'http://post-service:3006';
const INTERACTIONS_SERVICE_URL  = process.env.INTERACTIONS_SERVICE_URL  || 'http://interactions-service:3005';

// ─── DB helpers (Pomereno na vrh da bismo mogli da koristimo za komentare!) ───
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

// ─── Follow service helpers ───────────────────────────────

const isBlocked = async (userA, userB) => {
  try {
    const res = await fetch(`${FOLLOW_SERVICE_URL}/block-status?userB=${userB}`, {
      headers: { 'x-user-id': String(userA) }
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
    const res = await fetch(`${FOLLOW_SERVICE_URL}/stats/${userId}`, {
      headers: { 'x-user-id': String(userId) }
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.followers ?? 0;
  } catch (err) {
    console.error(`[getFollowersCount] Greška: ${err.message}`);
    return 0;
  }
};

const getFollowingCount = async (userId) => {
  try {
    const res = await fetch(`${FOLLOW_SERVICE_URL}/stats/${userId}`, {
      headers: { 'x-user-id': String(userId) }
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.following ?? 0;
  } catch (err) {
    console.error(`[getFollowingCount] Greška: ${err.message}`);
    return 0;
  }
};

const getIsFollowing = async (requesterId, userId) => {
  try {
    const res = await fetch(`${FOLLOW_SERVICE_URL}/relationship-status?following_id=${userId}`, {
      headers: { 'x-user-id': String(requesterId) }
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.followStatus === 'ACCEPTED';
  } catch (err) {
    console.error(`[getIsFollowing] Greška: ${err.message}`);
    return false;
  }
};

const getFollowingList = async (userId) => {
  try {
    const res = await fetch(`${FOLLOW_SERVICE_URL}/follow/following`, {
      headers: { 'x-user-id': String(userId) }
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
    const res = await fetch(`${FOLLOW_SERVICE_URL}/follow/followers`, {
      headers: { 'x-user-id': String(userId) }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.followers || [];
  } catch (err) {
    console.error(`[getFollowersList] Greška: ${err.message}`);
    return [];
  }
};

// ─── Interactions service helpers ────────────────────────

const getLikesCount = async (postId, userId, token) => {
  try {
    const res = await fetch(`${INTERACTIONS_SERVICE_URL}/posts/${postId}/likes/count`, {
      headers: {
        'x-user-id': String(userId),
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.count ?? 0;
  } catch (err) {
    console.error(`[getLikesCount] Greška: ${err.message}`);
    return 0;
  }
};

const getComments = async (postId, userId, token) => {
  try {
    const res = await fetch(`${INTERACTIONS_SERVICE_URL}/posts/${postId}/comments`, {
      headers: {
        'x-user-id': String(userId),
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    // Sortiramo od najnovijeg ka najstarijem
    return data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    console.error(`[getComments] Greška: ${err.message}`);
    return [];
  }
};

const getIsLiked = async (postId, userId, token) => {
  try {
    const res = await fetch(`${INTERACTIONS_SERVICE_URL}/posts/${postId}/likes/status`, {
      headers: {
        'x-user-id': String(userId),
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.isLiked === true;
  } catch (err) {
    console.error(`[getIsLiked] GreÅ¡ka: ${err.message}`);
    return false;
  }
};
// ─── Post service helpers ─────────────────────────────────

const getPostsByUserId = async (userId, token) => {
  try {
    const res = await fetch(`${POST_SERVICE_URL}/users/${userId}/posts`, {
      headers: {
        'x-user-id': String(userId),
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return [];
    const data = await res.json();

    // Popravljamo MinIO URL i dodajemo likes/comments za svaki post
    const postsWithInteractions = await Promise.all(data.map(async (post) => {
      // Popravljamo minio URL
      if (post.media) {
        post.media = post.media.map(m => ({
          ...m,
          mediaUrl: m.mediaUrl ? m.mediaUrl.replace('http://minio:9000', 'http://localhost:9000') : ''
        }));
      }

      // Dodajemo likes i comments iz interactions servisa
      const [likes_count, comments, isLiked] = await Promise.all([
        getLikesCount(post.id, userId, token),
        getComments(post.id, userId, token),
        getIsLiked(post.id, userId, token) // OVO JE DODATO
      ]);

      // ─── OVO JE NOVO: SPAJANJE KOMENTARA SA PODACIMA KORISNIKA ───
      if (comments.length > 0) {
        // Izvlačimo sve jedinstvene ID-jeve korisnika koji su komentarisali
        const userIds = [...new Set(comments.map(c => c.userId))];
        
        // Povezujemo se sa bazom da uzmemo njihove podatke
        const usersInfo = await getUsersByIds(userIds);
        
        // Pravimo rečnik (mapu) za bržu pretragu { 1: {username: 'Ksenija', avatar: '...'} }
        const userMap = {};
        usersInfo.forEach(u => { userMap[u.id] = u; });

        // Ubacujemo podatke u svaki komentar
        comments.forEach(c => {
          if (userMap[c.userId]) {
            c.username = userMap[c.userId].username;
            c.firstName = userMap[c.userId].first_name;
            c.lastName = userMap[c.userId].last_name;
            c.avatar = userMap[c.userId].profile_image_url;
          } else {
            c.username = "Nepoznato";
            c.avatar = null;
          }
        });
      }

      return {
        ...post,
        likes_count,
        comments,
        isLiked
      };
    }));

    return postsWithInteractions;
  } catch (err) {
    console.error(`[getPostsByUserId] Greška: ${err.message}`);
    return [];
  }
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

const getUserInfo = async (userId, requesterId, token) => {
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

  const [
    followers_count,
    following_count,
    is_following,
  ] = await Promise.all([
    getFollowersCount(userId),
    getFollowingCount(userId),
    getIsFollowing(requesterId, userId),
  ]);

  let posts = [];
  try {
    posts = await getPostsByUserId(userId, token);
  } catch (err) {
    console.error('[getUserInfo] Posts fetch failed:', err.message);
    posts = [];
  }

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

const updateUserProfile = async (userId, firstName, lastName, bio, profileImageUrl) => {
  const [result] = await pool.execute(
    `UPDATE users
     SET first_name = ?, last_name = ?, bio = ?, profile_image_url = ?
     WHERE id = ?`,
    [firstName, lastName, bio, profileImageUrl, userId]
  );
  return result.affectedRows > 0;
};

module.exports = {
  searchUsers,
  getUserInfo,
  getFollowers,
  getFollowing,
  updateUserProfile,
};