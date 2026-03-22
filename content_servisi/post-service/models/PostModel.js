const db = require('../config/db');

async function createPost(userId, caption, conn = db) {
  const [result] = await conn.execute(
    'INSERT INTO posts (user_id, caption) VALUES (?, ?)',
    [userId, caption ?? null]
  );

  return result.insertId;
}

async function addMedia(postId, position, mediaKey, mediaType, mediaSizeBytes, conn = db) {
  const [result] = await conn.execute(
    `INSERT INTO post_media (post_id, position, media_key, media_type, media_size_bytes)
     VALUES (?, ?, ?, ?, ?)`,
    [postId, position, mediaKey, mediaType, mediaSizeBytes]
  );

  return result.insertId;
}

async function getPostById(postId) {
  const [rows] = await db.execute(
    `SELECT id, user_id, caption, created_at, updated_at
     FROM posts
     WHERE id = ?`,
    [postId]
  );

  return rows[0] || null;
}

async function getPostMedia(postId) {
  const [rows] = await db.execute(
    `SELECT id, post_id, position, media_key, media_type, media_size_bytes, created_at
     FROM post_media
     WHERE post_id = ?
     ORDER BY position ASC`,
    [postId]
  );

  return rows;
}

async function getFullPostById(postId) {
  const post = await getPostById(postId);
  if (!post) return null;

  const media = await getPostMedia(postId);

  return {
    id: post.id,
    userId: post.user_id,
    caption: post.caption,
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    media
  };
}

async function getPostsByUserId(userId) {
  const [posts] = await db.execute(
    `SELECT id, user_id, caption, created_at, updated_at
     FROM posts
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );

  const result = [];
  for (const post of posts) {
    const media = await getPostMedia(post.id);
    result.push({
      id: post.id,
      userId: post.user_id,
      caption: post.caption,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      media
    });
  }

  return result;
}

async function updateCaption(postId, caption) {
  const [result] = await db.execute(
    'UPDATE posts SET caption = ? WHERE id = ?',
    [caption ?? null, postId]
  );

  return result.affectedRows > 0;
}

async function deletePost(postId) {
  const [result] = await db.execute(
    'DELETE FROM posts WHERE id = ?',
    [postId]
  );

  return result.affectedRows > 0;
}

async function getMediaById(mediaId) {
  const [rows] = await db.execute(
    `SELECT id, post_id, position, media_key, media_type, media_size_bytes, created_at
     FROM post_media
     WHERE id = ?`,
    [mediaId]
  );

  return rows[0] || null;
}

async function deleteMediaById(mediaId) {
  const [result] = await db.execute(
    'DELETE FROM post_media WHERE id = ?',
    [mediaId]
  );

  return result.affectedRows > 0;
}

module.exports = {
  createPost,
  addMedia,
  getPostById,
  getPostMedia,
  getFullPostById,
  getPostsByUserId,
  updateCaption,
  deletePost,
  getMediaById,
  deleteMediaById
};
