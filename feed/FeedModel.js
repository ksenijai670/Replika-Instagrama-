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

const FOLLOW_SERVICE_URL  = process.env.FOLLOW_SERVICE_URL        || 'http://follow-service:3004';
const POST_SERVICE_URL    = process.env.POST_SERVICE_URL          || 'http://post-service:3006';
const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL       || 'http://profile:3010';
const INTERACTIONS_URL    = process.env.INTERACTIONS_SERVICE_URL  || 'http://interactions-service:3005';

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

// ─── Follow helpers ───────────────────────────────────────

// Korisnici koje TI pratiš
const getFollowingIds = async (userId) => {
  try {
    const res = await fetch(`${FOLLOW_SERVICE_URL}/follow/following`, {
      headers: { 'x-user-id': String(userId), 'Content-Type': 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.following) ? data.following : [];
  } catch (err) {
    console.error('[getFollowingIds] Greška:', err.message);
    return [];
  }
};

// Korisnici koji TEBE prate
const getFollowerIds = async (userId) => {
  try {
    const res = await fetch(`${FOLLOW_SERVICE_URL}/follow/followers`, {
      headers: { 'x-user-id': String(userId), 'Content-Type': 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.followers) ? data.followers : [];
  } catch (err) {
    console.error('[getFollowerIds] Greška:', err.message);
    return [];
  }
};

// ─── Post/Profile/Interactions helpers ───────────────────

const getPostsByUserId = async (userId, requesterId, token) => {
  try {
    const res = await fetch(`${POST_SERVICE_URL}/users/${userId}/posts`, {
      headers: {
        'x-user-id': String(requesterId),
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[getPostsByUserId] Greška:', err.message);
    return [];
  }
};

const getUserInfo = async (userId, requesterId, token) => {
  try {
    const res = await fetch(`${PROFILE_SERVICE_URL}/users/${userId}`, {
      headers: { 'x-user-id': String(requesterId), 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch (err) {
    console.error('[getUserInfo] Greška:', err.message);
    return null;
  }
};

const getLikesCount = async (postId, requesterId, token) => {
  try {
    const res = await fetch(`${INTERACTIONS_URL}/posts/${postId}/likes/count`, {
      headers: { 'x-user-id': String(requesterId), 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.count ?? 0;
  } catch (err) {
    console.error('[getLikesCount] Greška:', err.message);
    return 0;
  }
};

const getIsLiked = async (postId, requesterId, token) => {
  try {
    const res = await fetch(`${INTERACTIONS_URL}/posts/${postId}/likes/status`, {
      headers: { 'x-user-id': String(requesterId), 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.isLiked === true;
  } catch (err) {
    console.error('[getIsLiked] Greška:', err.message);
    return false;
  }
};

const getComments = async (postId, requesterId, token) => {
  try {
    const res = await fetch(`${INTERACTIONS_URL}/posts/${postId}/comments`, {
      headers: { 'x-user-id': String(requesterId), 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) : [];
  } catch (err) {
    console.error('[getComments] Greška:', err.message);
    return [];
  }
};

// ─── Feed Glavna Funkcija ─────────────────────────────────

const getFeed = async (requesterId, limit = 20, offset = 0, token = '') => {
  // 1. Dohvati i korisnike koje pratiš I koji tebe prate — unija (mutual + one-way)
  const [followingIds, followerIds] = await Promise.all([
    getFollowingIds(requesterId),
    getFollowerIds(requesterId),
  ]);

  // Spajamo obe liste bez duplikata, dodajemo i sebe
  const allIds = [...new Set([...followingIds, ...followerIds, requesterId])];

  // 2. Dohvati postove svih korisnika paralelno
  const postArrays = await Promise.all(
    allIds.map(id => getPostsByUserId(id, token))
  );

  // 3. Spoji i sortiraj po datumu — najnoviji prvi
  const allPosts = postArrays
    .flat()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = allPosts.length;

  if (total === 0) return { data: [], total: 0, has_more: false };

  // 4. Paginacija
  const pagePosts = allPosts.slice(offset, offset + limit);

  if (pagePosts.length === 0) return { data: [], total, has_more: false };

  // 5. Obogati svaki post podacima
  const enriched = await Promise.all(
    pagePosts.map(async (post) => {
      const [userInfo, likes_count, isLiked, comments] = await Promise.all([
        getUserInfo(post.userId, requesterId, token),
        getLikesCount(post.id, requesterId, token),
        getIsLiked(post.id, requesterId, token),
        getComments(post.id, requesterId, token),
      ]);

      // Obogati komentare sa username podacima
      if (comments.length > 0) {
        const userIds = [...new Set(comments.map(c => Number(c.userId)))];
        const usersInfo = await getUsersByIds(userIds);
        const userMap = {};
        usersInfo.forEach(u => { userMap[Number(u.id)] = u; });

        comments.forEach(c => {
          const user = userMap[Number(c.userId)];
          if (user) {
            c.username = user.username;
            c.avatar = user.profile_image_url;
          } else {
            c.username = "Nepoznato";
            c.avatar = null;
          }
        });
      }

      // Popravi MinIO URL
      const media = (post.media || []).map(m => ({
        ...m,
        mediaUrl: m.mediaUrl ? m.mediaUrl.replace('http://minio:9000', 'http://localhost:9000') : '',
      }));

      return {
        id:        post.id,
        caption:   post.caption,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        userId:    post.userId,
        media,
        user: userInfo ? {
          id:                userInfo.id,
          username:          userInfo.username,
          first_name:        userInfo.first_name,
          last_name:         userInfo.last_name,
          profile_image_url: userInfo.profile_image_url,
        } : { id: post.userId },
        likes_count,
        isLiked,
        comments,
      };
    })
  );

  return {
    data:     enriched,
    total,
    has_more: offset + pagePosts.length < total,
  };
};

module.exports = { getFeed };