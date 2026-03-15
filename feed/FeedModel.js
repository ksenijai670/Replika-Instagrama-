const fetch = require('node-fetch');

const FOLLOW_SERVICE_URL    = process.env.FOLLOW_SERVICE_URL    || 'http://follow-service:3004';
const POST_SERVICE_URL      = process.env.POST_SERVICE_URL      || 'http://post-service:3006';
const PROFILE_SERVICE_URL   = process.env.PROFILE_SERVICE_URL   || 'http://profile:3010';
const INTERACTIONS_URL      = process.env.INTERACTIONS_SERVICE_URL || 'http://interactions-service:3005';
const MINIO_PUBLIC_URL      = process.env.MINIO_PUBLIC_URL      || 'http://minio:9000';
const MINIO_BUCKET          = process.env.MINIO_BUCKET          || 'posts-media';

// ─── Helpers ──────────────────────────────────────────────

const buildMediaUrl = (mediaKey) =>
  `${MINIO_PUBLIC_URL}/${MINIO_BUCKET}/${mediaKey}`;

const getFollowingIds = async (userId) => {
  const res = await fetch(`${FOLLOW_SERVICE_URL}/follow/following`, {
    method: 'GET',
    headers: {
      'x-user-id': String(userId),
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    console.error('Follow service error:', res.status);
    return [];
  }

  const data = await res.json();
  return Array.isArray(data.following) ? data.following : [];
};

const getPostsByUserId = async (userId) => {
  const res = await fetch(`${POST_SERVICE_URL}/posts/user/${userId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

const getUserInfo = async (userId, requesterId) => {
  const res = await fetch(`${PROFILE_SERVICE_URL}/users/${userId}`, {
    headers: {
      'x-user-id': String(requesterId),
      'x-username': '',
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.user || null;
};

const getLikesCount = async (postId, requesterId) => {
  const res = await fetch(
    `${INTERACTIONS_URL}/posts/${postId}/likes/count`,
    { headers: { 'x-user-id': String(requesterId) } }
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return data.count ?? 0;
};

const getCommentsCount = async (postId, requesterId) => {
  const res = await fetch(
    `${INTERACTIONS_URL}/posts/${postId}/comments/count`,
    { headers: { 'x-user-id': String(requesterId) } }
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return data.count ?? 0;
};

const getComments = async (postId, requesterId) => {
  const res = await fetch(
    `${INTERACTIONS_URL}/posts/${postId}/comments`,
    { headers: { 'x-user-id': String(requesterId) } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

// ─── Feed ─────────────────────────────────────────────────

const getFeed = async (requesterId, limit = 20, offset = 0) => {
  // 1. Dohvati listu ID-jeva koje korisnik prati
  const followingIds = await getFollowingIds(requesterId);

  if (followingIds.length === 0) {
    return { data: [], total: 0, has_more: false };
  }

  // 2. Dohvati postove svih praćenih korisnika paralelno
  const postArrays = await Promise.all(
    followingIds.map(id => getPostsByUserId(id))
  );

  // 3. Spoji i sortiraj po datumu — najnoviji prvi
  const allPosts = postArrays
    .flat()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = allPosts.length;

  if (total === 0) {
    return { data: [], total: 0, has_more: false };
  }

  // 4. Paginacija
  const pagePosts = allPosts.slice(offset, offset + limit);

  if (pagePosts.length === 0) {
    return { data: [], total, has_more: false };
  }

  // 5. Za svaki post dohvati user info + likes + comments paralelno
  const enriched = await Promise.all(
    pagePosts.map(async (post) => {
      const [userInfo, likes_count, comments_count, comments] = await Promise.all([
        getUserInfo(post.userId, requesterId),
        getLikesCount(post.id, requesterId),
        getCommentsCount(post.id, requesterId),
        getComments(post.id, requesterId),
      ]);

      // Dodaj mediaUrl za svaki media item
      const media = (post.media || []).map(m => ({
        ...m,
        mediaUrl: m.mediaUrl || buildMediaUrl(m.mediaKey),
      }));

      return {
        id:           post.id,
        caption:      post.caption,
        createdAt:    post.createdAt,
        updatedAt:    post.updatedAt,
        media,
        user: userInfo ? {
          id:                userInfo.id,
          username:          userInfo.username,
          first_name:        userInfo.first_name,
          last_name:         userInfo.last_name,
          profile_image_url: userInfo.profile_image_url,
        } : { id: post.userId },
        likes_count,
        comments_count,
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