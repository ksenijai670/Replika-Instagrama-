const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const fetch = require('node-fetch');
const PostModel = require('../models/PostModel');

const uploadDir = process.env.UPLOAD_DIR || 'uploads';
const maxFiles = Number(process.env.MAX_FILES || 20);

const INTERACTIONS_SERVICE_URL = process.env.INTERACTIONS_SERVICE_URL || 'http://interactions-service:3002';

function isAllowedMime(mime) {
  return mime && (mime.startsWith('image/') || mime.startsWith('video/'));
}

function toAbsoluteFilePath(mediaUrl) {
  const cleanUrl = mediaUrl.startsWith('/') ? mediaUrl.slice(1) : mediaUrl;
  return path.resolve(cleanUrl);
}

async function safeDeleteFile(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

function validateOwner(requestUserId, postOwnerId) {
  return Number(requestUserId) === Number(postOwnerId);
}

const createPost = async (req, res) => {
  const { userId, caption } = req.body;

  if (!userId || Number.isNaN(Number(userId))) {
    return res.status(400).json({ error: 'Potreban je validni userId' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Potreban bar 1 fajl' });
  }

  if (req.files.length > maxFiles) {
    return res.status(400).json({ error: `Max ${maxFiles} fajlova je dozvoljeno` });
  }

  for (const file of req.files) {
    if (!isAllowedMime(file.mimetype)) {
      return res.status(400).json({ error: 'Samo slike i videi su dozvoljeni' });
    }
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const postId = await PostModel.createPost(Number(userId), caption, conn);

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const mediaType = file.mimetype.startsWith('video/') ? 'video' : 'image';
      const mediaUrl = `/${uploadDir}/${file.filename}`;

      await PostModel.addMedia(
        postId,
        i,
        mediaUrl,
        mediaType,
        file.size,
        conn
      );
    }

    await conn.commit();

    const fullPost = await PostModel.getFullPostById(postId);
    return res.status(201).json(fullPost);
  } catch (err) {
    await conn.rollback();

    for (const file of req.files || []) {
      const absolutePath = path.resolve(file.path);
      await safeDeleteFile(absolutePath);
    }

    return res.status(500).json({ error: 'Neuspešno kreiranje objave' });
  } finally {
    conn.release();
  }
};

const getPostMeta = async (req, res) => {
  try {
    const post = await PostModel.getPostById(req.params.id);

    if (!post) {
      return res.status(404).json({ error: 'Objava nije pronađena' });
    }

    return res.json({
      id: post.id,
      userId: post.user_id
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Neuspešno preuzimanje metadata objave' });
  }
};

const getPostById = async (req, res) => {
  try {
    const post = await PostModel.getFullPostById(req.params.id);

    if (!post) {
      return res.status(404).json({ error: 'Objava nije pronađena' });
    }

    return res.json(post);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Neuspešno preuzimanje objave' });
  }
};

const getPostsByUserId = async (req, res) => {
  const userId = Number(req.params.userId);

  if (Number.isNaN(userId)) {
    return res.status(400).json({ error: 'Nije validan userId' });
  }

  try {
    const posts = await PostModel.getPostsByUserId(userId);
    return res.json(posts);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Neuspešno preuzimanje objave' });
  }
};

const updateCaption = async (req, res) => {
  const postId = Number(req.params.id);
  const { userId, caption } = req.body;

  if (Number.isNaN(postId)) {
    return res.status(400).json({ error: 'id objave nije validan' });
  }

  if (!userId || Number.isNaN(Number(userId))) {
    return res.status(400).json({ error: 'Potreban je validni userId' });
  }

  try {
    const post = await PostModel.getPostById(postId);

    if (!post) {
      return res.status(404).json({ error: 'Objava nije pronađena' });
    }

    if (!validateOwner(userId, post.user_id)) {
      return res.status(403).json({ error: 'Samo korisnik čija je objava može promeniti opis' });
    }

    await PostModel.updateCaption(postId, caption);

    const updatedPost = await PostModel.getFullPostById(postId);
    return res.json(updatedPost);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Neuspešno menjanje opisa' });
  }
};

const deletePost = async (req, res) => {
  const postId = Number(req.params.id);
  const requestUserId = Number(req.body.userId || req.query.userId);

  if (Number.isNaN(postId)) {
    return res.status(400).json({ error: 'id objave nije validan' });
  }

  if (Number.isNaN(requestUserId)) {
    return res.status(400).json({ error: 'Potreban je validni userId' });
  }

  try {
    const post = await PostModel.getPostById(postId);

    if (!post) {
      return res.status(404).json({ error: 'Objava nije pronađena' });
    }

    if (!validateOwner(requestUserId, post.user_id)) {
      return res.status(403).json({ error: 'Samo vlasnik može obrisati objavu' });
    }

    const media = await PostModel.getPostMedia(postId);

    await PostModel.deletePost(postId);

    const response = await fetch(
      `${INTERACTIONS_SERVICE_URL}/interactions/by-post/${postId}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new Error('Greška pri brisanju interakcija');
    }

    for (const item of media) {
      const filePath = toAbsoluteFilePath(item.media_url);
      await safeDeleteFile(filePath);
    }

    return res.json({ message: 'Uspešno brisanje objave' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Neuspešno brisanje objave' });
  }
};

const deletePostMedia = async (req, res) => {
  const postId = Number(req.params.id);
  const mediaId = Number(req.params.mediaId);
  const requestUserId = Number(req.body.userId || req.query.userId);

  if (Number.isNaN(postId) || Number.isNaN(mediaId)) {
    return res.status(400).json({ error: 'Post id ili media id nije validan' });
  }

  if (Number.isNaN(requestUserId)) {
    return res.status(400).json({ error: 'Potreban je validni userId' });
  }

  try {
    const post = await PostModel.getPostById(postId);

    if (!post) {
      return res.status(404).json({ error: 'Objava nije pronađena' });
    }

    if (!validateOwner(requestUserId, post.user_id)) {
      return res.status(403).json({ error: 'Samo vlasnik može obrisati medije' });
    }

    const media = await PostModel.getMediaById(mediaId);

    if (!media) {
      return res.status(404).json({ error: 'Nije pronađena media' });
    }

    if (Number(media.post_id) !== postId) {
      return res.status(400).json({ error: 'Media ne pripada ovoj objavi' });
    }

    const filePath = toAbsoluteFilePath(media.media_url);
    await safeDeleteFile(filePath);

    await PostModel.deleteMediaById(mediaId);

    return res.json({ message: 'Uspešno brisanje medije' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Neuspešno brisanje medije' });
  }
};

module.exports = {
  createPost,
  getPostMeta,
  getPostById,
  getPostsByUserId,
  updateCaption,
  deletePost,
  deletePostMedia
};
