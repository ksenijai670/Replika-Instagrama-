//const fs = require('fs'); //NE TREBA
//const path = require('path');  //NE TREBA
const minioClient = require("../config/minio");
const crypto = require("crypto");
const db = require("../config/db");
const fetch = require("node-fetch");
const PostModel = require("../models/PostModel");

//const uploadDir = process.env.UPLOAD_DIR || "uploads"; //NE TREBA
const maxFiles = Number(process.env.MAX_FILES || 20);

function isAllowedMime(mime) {
  return mime && (mime.startsWith("image/") || mime.startsWith("video/"));
}
//NE TREBA
/*
function toAbsoluteFilePath(mediaUrl) {
  const cleanUrl = mediaUrl.startsWith("/") ? mediaUrl.slice(1) : mediaUrl;
  return path.resolve(cleanUrl);
}
//NE TREBA lokalno cuva 
async function safeDeleteFile(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
}
*/
/* MINIO HELPER 
function extractObjectNameFromUrl(mediaUrl) {
  const prefix = `${process.env.MINIO_PUBLIC_URL}/${process.env.MINIO_BUCKET}/`;
  return mediaUrl.replace(prefix, "");
}*/

function buildMediaUrl(mediaKey) {
  return `${process.env.MINIO_PUBLIC_URL}/${process.env.MINIO_BUCKET}/${mediaKey}`;
}

function mapMedia(item) {
  return {
    id: item.id,
    postId: item.post_id,
    position: item.position,
    mediaKey: item.media_key,
    mediaUrl: buildMediaUrl(item.media_key),
    mediaType: item.media_type,
    mediaSizeBytes: item.media_size_bytes,
    createdAt: item.created_at,
  };
}

function mapPost(post) {
  return {
    ...post,
    media: (post.media || []).map(mapMedia),
  };
}

//kraj
function validateOwner(requestUserId, postOwnerId) {
  return Number(requestUserId) === Number(postOwnerId);
}

//jwt uzimamo iz headera userId
function getRequestUserId(req) {
  return Number(req.headers["x-user-id"]);
}

const createPost = async (req, res) => {
  //logovanje za proveru privremeno
  console.log("CREATE POST HIT");
  console.log("BODY", req.body);
  console.log("FILES", req.files);
  //kraj logovanja
  /*
  const { userId, caption } = req.body;

  if (!userId || Number.isNaN(Number(userId))) {
    return res.status(400).json({ error: "Potreban je validni userId" });
  } */
  //sa jwt
  const requestUserId = getRequestUserId(req);
  const { caption } = req.body;

  if (Number.isNaN(requestUserId)) {
    return res
      .status(401)
      .json({ error: "Nedostaje validan userId iz gateway-a" });
  }
  //kraj
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "Potreban bar 1 fajl" });
  }

  if (req.files.length > maxFiles) {
    return res
      .status(400)
      .json({ error: `Max ${maxFiles} fajlova je dozvoljeno` });
  }

  for (const file of req.files) {
    if (!isAllowedMime(file.mimetype)) {
      return res
        .status(400)
        .json({ error: "Samo slike i videi su dozvoljeni" });
    }
  }

  const conn = await db.getConnection();

  //ovo je za minio, da bi mogli da obrisemo uploadovane fajlove ako nesto ne uspe tokom kreiranja objave
  const uploadedObjects = [];

  try {
    await conn.beginTransaction();

    const postId = await PostModel.createPost(requestUserId, caption, conn);
    /* NE TREBA - lokalno cuvanje fajlova
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const mediaType = file.mimetype.startsWith("video/") ? "video" : "image";
      const mediaUrl = `/${uploadDir}/${file.filename}`;

      await PostModel.addMedia(postId, i, mediaUrl, mediaType, file.size, conn);
    }
    */

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const mediaType = file.mimetype.startsWith("video/") ? "video" : "image";

      const objectName = `${Date.now()}-${crypto.randomUUID()}-${file.originalname}`;

      await minioClient.putObject(
        process.env.MINIO_BUCKET,
        objectName,
        file.buffer,
        file.size,
        { "Content-Type": file.mimetype },
      );

      uploadedObjects.push(objectName);

      //const mediaUrl = `${process.env.MINIO_PUBLIC_URL}/${process.env.MINIO_BUCKET}/${objectName}`;

      await PostModel.addMedia(
        postId,
        i,
        objectName,
        mediaType,
        file.size,
        conn,
      );
    }

    //kraj
    await conn.commit();

    const fullPost = await PostModel.getFullPostById(postId);
    return res.status(201).json(mapPost(fullPost));
  } catch (err) {
    //logovanje privremeno
    console.error("GRESKA TOKOM KREIRANJA OBJAVE:", err);
    await conn.rollback();
    /* i ovo menjamo jer je za lokalno cuvanje fajlova, a sada koristimo minio
    for (const file of req.files || []) {
      const absolutePath = path.resolve(file.path);
      await safeDeleteFile(absolutePath);
    }
    */
    //rollback za minio - brisemo sve fajlove koji su uploadovani tokom ovog zahteva
    for (const objectName of uploadedObjects) {
      try {
        await minioClient.removeObject(process.env.MINIO_BUCKET, objectName);
      } catch (removeErr) {
        console.error("Greška pri rollback brisanju iz MinIO:", removeErr);
      }
    }
    //kraj
    return res
      .status(500)
      .json({ error: "Neuspešno kreiranje objave", details: err.message });
  } finally {
    conn.release();
  }
};

const getPostMeta = async (req, res) => {
  try {
    const post = await PostModel.getPostById(req.params.id);

    if (!post) {
      return res.status(404).json({ error: "Objava nije pronađena" });
    }

    return res.json({
      id: post.id,
      userId: post.user_id,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Neuspešno preuzimanje metadata objave" });
  }
};

const getPostById = async (req, res) => {
  try {
    const post = await PostModel.getFullPostById(req.params.id);

    if (!post) {
      return res.status(404).json({ error: "Objava nije pronađena" });
    }

    return res.json(mapPost(post));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Neuspešno preuzimanje objave" });
  }
};

const getPostsByUserId = async (req, res) => {
  const userId = Number(req.params.userId);

  if (Number.isNaN(userId)) {
    return res.status(400).json({ error: "Nije validan userId" });
  }

  try {
    const posts = await PostModel.getPostsByUserId(userId);
    return res.json(posts.map(mapPost));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Neuspešno preuzimanje objave" });
  }
};

const updateCaption = async (req, res) => {
  const postId = Number(req.params.id);
  //const { userId, caption } = req.body;

  const requestUserId = getRequestUserId(req);
  const { caption } = req.body;

  if (Number.isNaN(postId)) {
    return res.status(400).json({ error: "id objave nije validan" });
  }
  /*
  if (!userId || Number.isNaN(Number(userId))) {
    return res.status(400).json({ error: "Potreban je validni userId" });
  }*/
  //sa jwt
  if (Number.isNaN(requestUserId)) {
    return res
      .status(401)
      .json({ error: "Nedostaje validan userId iz gateway-a" });
  }

  try {
    const post = await PostModel.getPostById(postId);

    if (!post) {
      return res.status(404).json({ error: "Objava nije pronađena" });
    }

    if (!validateOwner(requestUserId, post.user_id)) {
      return res
        .status(403)
        .json({ error: "Samo korisnik čija je objava može promeniti opis" });
    }

    await PostModel.updateCaption(postId, caption);

    const updatedPost = await PostModel.getFullPostById(postId);
    return res.json(mapPost(updatedPost));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Neuspešno menjanje opisa" });
  }
};

const deletePost = async (req, res) => {
  const postId = Number(req.params.id);
  //const requestUserId = Number(req.body.userId || req.query.userId);
  const requestUserId = getRequestUserId(req);

  if (Number.isNaN(postId)) {
    return res.status(400).json({ error: "id objave nije validan" });
  }
  /*
  if (Number.isNaN(requestUserId)) {
    return res.status(400).json({ error: "Potreban je validni userId" });
  }*/
  //sa jwt
  if (Number.isNaN(requestUserId)) {
    return res
      .status(401)
      .json({ error: "Nedostaje validan userId iz gateway-a" });
  }

  try {
    const post = await PostModel.getPostById(postId);

    if (!post) {
      return res.status(404).json({ error: "Objava nije pronađena" });
    }

    if (!validateOwner(requestUserId, post.user_id)) {
      return res
        .status(403)
        .json({ error: "Samo vlasnik može obrisati objavu" });
    }

    const media = await PostModel.getPostMedia(postId);

    await PostModel.deletePost(postId);

    const response = await fetch(
      `${process.env.INTERACTIONS_SERVICE_URL}/interactions/by-post/${postId}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      throw new Error("Greška pri brisanju interakcija");
    }
    /* NE TREBA - brisanje fajlova sa diska lokalno
    for (const item of media) {
      const filePath = toAbsoluteFilePath(item.media_url);
      await safeDeleteFile(filePath);
    }
    */
    //minio
    /*
    for (const item of media) {
      const filePath = toAbsoluteFilePath(item.media_key);
      await safeDeleteFile(filePath);
    }*/
    for (const item of media) {
      await minioClient.removeObject(process.env.MINIO_BUCKET, item.media_key);
    }
    //kraj
    return res.json({ message: "Uspešno brisanje objave" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Neuspešno brisanje objave" });
  }
};

const deletePostMedia = async (req, res) => {
  const postId = Number(req.params.id);
  const mediaId = Number(req.params.mediaId);
  //const requestUserId = Number(req.body.userId || req.query.userId);

  const requestUserId = getRequestUserId(req);

  if (Number.isNaN(postId) || Number.isNaN(mediaId)) {
    return res.status(400).json({ error: "Post id ili media id nije validan" });
  }

  if (Number.isNaN(requestUserId)) {
    return res
      .status(401)
      .json({ error: "Nedostaje validan userId iz gateway-a" });
  }

  try {
    const post = await PostModel.getPostById(postId);

    if (!post) {
      return res.status(404).json({ error: "Objava nije pronađena" });
    }

    if (!validateOwner(requestUserId, post.user_id)) {
      return res
        .status(403)
        .json({ error: "Samo vlasnik može obrisati medije" });
    }

    const media = await PostModel.getMediaById(mediaId);

    if (!media) {
      return res.status(404).json({ error: "Nije pronađena media" });
    }

    if (Number(media.post_id) !== postId) {
      return res.status(400).json({ error: "Media ne pripada ovoj objavi" });
    }
    /* ovo je bilo za lokalno
    const filePath = toAbsoluteFilePath(media.media_url);
    await safeDeleteFile(filePath);
    */
    //minio - iz media_key treba izvuci objectName koji smo koristili prilikom uploadovanja na minio, i onda pozvati removeObject sa tim objectName da bi obrisali fajl sa minio servera
    //const objectName = extractObjectNameFromUrl(media.media_key);
    await minioClient.removeObject(process.env.MINIO_BUCKET, media.media_key);

    //kraj
    await PostModel.deleteMediaById(mediaId);

    return res.json({ message: "Uspešno brisanje medije" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Neuspešno brisanje medije" });
  }
};

module.exports = {
  createPost,
  getPostMeta,
  getPostById,
  getPostsByUserId,
  updateCaption,
  deletePost,
  deletePostMedia,
};
