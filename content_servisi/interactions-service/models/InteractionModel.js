const db = require('../config/db');

async function addLike(userId, postId) {
  const [result] = await db.execute(
    'INSERT INTO likes (user_id, post_id) VALUES (?, ?)',
    [userId, postId]
  );
  return result;
}

async function removeLike(userId, postId) {
  const [result] = await db.execute(
    'DELETE FROM likes WHERE user_id = ? AND post_id = ?',
    [userId, postId]
  );
  return result.affectedRows > 0;
}

async function likeExists(userId, postId) {
  const [rows] = await db.execute(
    'SELECT 1 FROM likes WHERE user_id = ? AND post_id = ? LIMIT 1',
    [userId, postId]
  );
  return rows.length > 0;
}

async function getLikesCount(postId) {
  const [rows] = await db.execute(
    'SELECT COUNT(*) AS count FROM likes WHERE post_id = ?',
    [postId]
  );
  return rows[0].count;
}

async function getLikesByPostId(postId) {
  const [rows] = await db.execute(
    `SELECT user_id, post_id, created_at
     FROM likes
     WHERE post_id = ?`,
    [postId]
  );
  return rows;
}

async function addComment(userId, postId, content) {
  const [result] = await db.execute(
    'INSERT INTO comments (user_id, post_id, content) VALUES (?, ?, ?)',
    [userId, postId, content]
  );
  return result.insertId;
}

async function getCommentById(commentId) {
  const [rows] = await db.execute(
    `SELECT id, user_id, post_id, content, created_at, updated_at
     FROM comments
     WHERE id = ?`,
    [commentId]
  );
  return rows[0] || null;
}

async function updateComment(commentId, content) {
  const [result] = await db.execute(
    'UPDATE comments SET content = ? WHERE id = ?',
    [content, commentId]
  );
  return result.affectedRows > 0;
}

async function deleteComment(commentId) {
  const [result] = await db.execute(
    'DELETE FROM comments WHERE id = ?',
    [commentId]
  );
  return result.affectedRows > 0;
}

async function getCommentsByPostId(postId) {
  const [rows] = await db.execute(
    `SELECT id, user_id, post_id, content, created_at, updated_at
     FROM comments
     WHERE post_id = ?
     ORDER BY created_at ASC`,
    [postId]
  );
  return rows;
}

async function getCommentsCount(postId) {
  const [rows] = await db.execute(
    'SELECT COUNT(*) AS count FROM comments WHERE post_id = ?',
    [postId]
  );
  return rows[0].count;
}

async function deleteInteractionsByPostId(postId) {
  await db.execute('DELETE FROM likes WHERE post_id = ?', [postId]);
  await db.execute('DELETE FROM comments WHERE post_id = ?', [postId]);
}

module.exports = {
  addLike,
  removeLike,
  likeExists,
  getLikesCount,
  getLikesByPostId,
  addComment,
  getCommentById,
  updateComment,
  deleteComment,
  getCommentsByPostId,
  getCommentsCount,
  deleteInteractionsByPostId
};
