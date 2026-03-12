const fetch = require('node-fetch');
const InteractionModel = require('../models/InteractionModel');

const POST_SERVICE_URL = process.env.POST_SERVICE_URL || 'http://post-service:3001';
const RELATIONSHIP_SERVICE_URL = process.env.RELATIONSHIP_SERVICE_URL || 'http://follow-service:3004';
const USER_INFO_SERVICE_URL = process.env.USER_INFO_SERVICE_URL || 'http://user-info:3013';

function isValidId(value) {
  return !Number.isNaN(Number(value)) && Number(value) > 0;
}

function getBearerToken(req) {
  return req.headers.authorization?.split(' ')[1] || null;
}

async function getPostMeta(postId) {
  const response = await fetch(`${POST_SERVICE_URL}/posts/${postId}/meta`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Greška pri komunikaciji sa post servisom');
  }

  return response.json();
}

async function getBlockStatus(userA, userB) {
  const url = `${RELATIONSHIP_SERVICE_URL}/block-status?userA=${userA}&userB=${userB}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Greška pri komunikaciji sa relationship servisom (block-status)');
  }

  const data = await response.json();

  return !!data.blocked;
}

async function getRelationshipStatus(viewerId, ownerId) {
  const url = `${RELATIONSHIP_SERVICE_URL}/relationship-status?follower_id=${viewerId}&following_id=${ownerId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Greška pri komunikaciji sa relationship servisom (relationship-status)');
  }

  const data = await response.json();

  return {
    blocked: !!data.blocked,
    followStatus: data.followStatus || 'NONE',
    isFollowing: data.followStatus === 'ACCEPTED'
  };
}

async function getProfileVisibility(ownerId, token) {
  const response = await fetch(`${USER_INFO_SERVICE_URL}/users/${ownerId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Greška pri komunikaciji sa userInfo servisom');
  }

  const data = await response.json();

  return {
    isPublic: !data.user.is_private
  };
}

async function canInteractWithPost(viewerId, ownerId, token) {
  if (Number(viewerId) === Number(ownerId)) {
    return true;
  }

  const blocked = await getBlockStatus(viewerId, ownerId);
  if (blocked) {
    return false;
  }

  const relationship = await getRelationshipStatus(viewerId, ownerId);
  const visibility = await getProfileVisibility(ownerId, token);

  if (!visibility) {
    return false;
  }

  return visibility.isPublic || relationship.isFollowing;
}

function mapComment(comment) {
  return {
    id: comment.id,
    userId: comment.user_id,
    postId: comment.post_id,
    content: comment.content,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at
  };
}

const likePost = async (req, res) => {
  const postId = Number(req.params.id);
  const userId = Number(req.body.userId);
  const token = getBearerToken(req);

  if (!isValidId(postId)) {
    return res.status(400).json({ error: 'Neispravan postId' });
  }

  if (!isValidId(userId)) {
    return res.status(400).json({ error: 'userId je obavezan i mora biti broj' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  try {
    const postMeta = await getPostMeta(postId);

    if (!postMeta) {
      return res.status(404).json({ error: 'Objava nije pronađena' });
    }

    const allowed = await canInteractWithPost(userId, postMeta.userId, token);

    if (!allowed) {
      return res.status(403).json({ error: 'Nemate dozvolu da lajkujete ovu objavu' });
    }

    const exists = await InteractionModel.likeExists(userId, postId);
    if (exists) {
      return res.json({ message: 'Objava je već lajkovana' });
    }

    await InteractionModel.addLike(userId, postId);

    return res.status(201).json({ message: 'Objava je uspešno lajkovana' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Greška pri lajkovanju objave' });
  }
};


const unlikePost = async (req, res) => {
  const postId = Number(req.params.id);
  const userId = Number(req.body.userId);
  const token = getBearerToken(req);

  if (!isValidId(postId)) {
    return res.status(400).json({ error: 'Neispravan postId' });
  }

  if (!isValidId(userId)) {
    return res.status(400).json({ error: 'userId je obavezan i mora biti broj' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  try {
    await InteractionModel.removeLike(userId, postId);
    return res.json({ message: 'Lajk je uklonjen' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Greška pri uklanjanju lajka' });
  }
};

const getLikesCount = async (req, res) => {
  const postId = Number(req.params.id);
  const viewerId = Number(req.query.userId);
  const token = getBearerToken(req);

  if (!isValidId(postId)) {
    return res.status(400).json({ error: 'Neispravan postId' });
  }

  if (!isValidId(viewerId)) {
    return res.status(400).json({ error: 'userId je obavezan i mora biti broj' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  try {
    const postMeta = await getPostMeta(postId);

    if (!postMeta) {
      return res.status(404).json({ error: 'Objava nije pronađena' });
    }

    const allowed = await canInteractWithPost(viewerId, postMeta.userId, token);

    if (!allowed) {
      return res.status(403).json({ error: 'Nemate dozvolu da vidite broj lajkova ove objave' });
    }

    const likes = await InteractionModel.getLikesByPostId(postId);

    let count = 0;

    for (const like of likes) {
      const blockedByOwner = await getBlockStatus(postMeta.userId, like.user_id);

      if (!blockedByOwner) {
        count++;
      }
    }

    return res.json({ count });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Greška pri brojanju lajkova' });
  }
};


const addComment = async (req, res) => {
  const postId = Number(req.params.id);
  const userId = Number(req.body.userId);
  const content = req.body.content?.trim();
  const token = getBearerToken(req);

  if (!isValidId(postId)) {
    return res.status(400).json({ error: 'Neispravan postId' });
  }

  if (!isValidId(userId)) {
    return res.status(400).json({ error: 'userId je obavezan i mora biti broj' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  if (!content) {
    return res.status(400).json({ error: 'Sadržaj komentara je obavezan' });
  }

  if (content.length > 1000) {
    return res.status(400).json({ error: 'Komentar je predugačak' });
  }

  try {
    const postMeta = await getPostMeta(postId);

    if (!postMeta) {
      return res.status(404).json({ error: 'Objava nije pronađena' });
    }

    const allowed = await canInteractWithPost(userId, postMeta.userId, token);

    if (!allowed) {
      return res.status(403).json({ error: 'Nemate dozvolu da komentarišete ovu objavu' });
    }

    const commentId = await InteractionModel.addComment(userId, postId, content);

    return res.status(201).json({
      id: commentId,
      message: 'Komentar je dodat'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Greška pri dodavanju komentara' });
  }
};


const updateComment = async (req, res) => {
  const commentId = Number(req.params.commentId);
  const userId = Number(req.body.userId);
  const content = req.body.content?.trim();
  const token = getBearerToken(req);

  if (!isValidId(commentId)) {
    return res.status(400).json({ error: 'Neispravan commentId' });
  }

  if (!isValidId(userId)) {
    return res.status(400).json({ error: 'userId je obavezan i mora biti broj' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  if (!content) {
    return res.status(400).json({ error: 'Sadržaj komentara je obavezan' });
  }

  if (content.length > 1000) {
    return res.status(400).json({ error: 'Komentar je predugačak' });
  }

  try {
    const comment = await InteractionModel.getCommentById(commentId);

    if (!comment) {
      return res.status(404).json({ error: 'Komentar nije pronađen' });
    }

    if (Number(comment.user_id) !== userId) {
      return res.status(403).json({ error: 'Možete menjati samo svoj komentar' });
    }

    await InteractionModel.updateComment(commentId, content);

    const updated = await InteractionModel.getCommentById(commentId);
    return res.json(mapComment(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Greška pri izmeni komentara' });
  }
};

const deleteComment = async (req, res) => {
  const commentId = Number(req.params.commentId);
  const userId = Number(req.body.userId || req.query.userId);
  const token = getBearerToken(req);

  if (!isValidId(commentId)) {
    return res.status(400).json({ error: 'Neispravan commentId' });
  }

  if (!isValidId(userId)) {
    return res.status(400).json({ error: 'userId je obavezan i mora biti broj' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  try {
    const comment = await InteractionModel.getCommentById(commentId);

    if (!comment) {
      return res.status(404).json({ error: 'Komentar nije pronađen' });
    }

    const postMeta = await getPostMeta(comment.post_id);

    if (!postMeta) {
      return res.status(404).json({ error: 'Objava nije pronađena' });
    }

    const isCommentAuthor = Number(comment.user_id) === userId;
    const isPostOwner = Number(postMeta.userId) === userId;

    if (!isCommentAuthor && !isPostOwner) {
      return res.status(403).json({ error: 'Nemate dozvolu da obrišete ovaj komentar' });
    }

    await InteractionModel.deleteComment(commentId);

    return res.json({ message: 'Komentar je obrisan' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Greška pri brisanju komentara' });
  }
};

const getCommentsByPost = async (req, res) => {
  const postId = Number(req.params.id);
  const viewerId = Number(req.query.userId);
  const token = getBearerToken(req);

  if (!isValidId(postId)) {
    return res.status(400).json({ error: 'Neispravan postId' });
  }

  if (!isValidId(viewerId)) {
    return res.status(400).json({ error: 'userId je obavezan i mora biti broj' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  try {
    const postMeta = await getPostMeta(postId);

    if (!postMeta) {
      return res.status(404).json({ error: 'Objava nije pronađena' });
    }

    const allowed = await canInteractWithPost(viewerId, postMeta.userId, token);

    if (!allowed) {
      return res.status(403).json({ error: 'Nemate dozvolu da vidite komentare ove objave' });
    }

    const comments = await InteractionModel.getCommentsByPostId(postId);
    const filteredComments = [];

    for (const comment of comments) {
      const blockedByOwner = await getBlockStatus(postMeta.userId, comment.user_id);

      if (!blockedByOwner) {
        filteredComments.push(comment);
      }
    }

    return res.json(filteredComments.map(mapComment));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Greška pri čitanju komentara' });
  }
};

const getCommentsCount = async (req, res) => {
  const postId = Number(req.params.id);
  const viewerId = Number(req.query.userId);
  const token = getBearerToken(req);

  if (!isValidId(postId)) {
    return res.status(400).json({ error: 'Neispravan postId' });
  }

  if (!isValidId(viewerId)) {
    return res.status(400).json({ error: 'userId je obavezan i mora biti broj' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  try {
    const postMeta = await getPostMeta(postId);

    if (!postMeta) {
      return res.status(404).json({ error: 'Objava nije pronađena' });
    }

    const allowed = await canInteractWithPost(viewerId, postMeta.userId, token);

    if (!allowed) {
      return res.status(403).json({ error: 'Nemate dozvolu da vidite broj komentara ove objave' });
    }

    const comments = await InteractionModel.getCommentsByPostId(postId);

    let count = 0;

    for (const comment of comments) {
      const blockedByOwner = await getBlockStatus(postMeta.userId, comment.user_id);

      if (!blockedByOwner) {
        count++;
      }
    }

    return res.json({ count });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Greška pri brojanju komentara' });
  }
};


const deleteByPost = async (req, res) => {
  const postId = Number(req.params.postId);

  if (!isValidId(postId)) {
    return res.status(400).json({ error: 'Neispravan postId' });
  }

  try {
    await InteractionModel.deleteInteractionsByPostId(postId);
    return res.json({ message: 'Interakcije za objavu su obrisane' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Greška pri brisanju interakcija objave' });
  }
};

module.exports = {
  likePost,
  unlikePost,
  getLikesCount,
  addComment,
  updateComment,
  deleteComment,
  getCommentsByPost,
  getCommentsCount,
  deleteByPost
};
