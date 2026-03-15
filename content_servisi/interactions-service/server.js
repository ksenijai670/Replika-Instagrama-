const express = require('express');
const dotenv = require('dotenv');
const InteractionController = require('./controllers/InteractionController');

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3005;

app.get('/test', (req, res) => {
  res.json({ message: 'Interactions service radi' });
});

/* lajkovi */
app.post('/posts/:id/likes', InteractionController.likePost);
app.delete('/posts/:id/likes', InteractionController.unlikePost);
app.get('/posts/:id/likes/count', InteractionController.getLikesCount);
app.get('/posts/:id/likes/status', InteractionController.checkLikeStatus);

/* komentari */
app.post('/posts/:id/comments', InteractionController.addComment);
app.get('/posts/:id/comments', InteractionController.getCommentsByPost);
app.put('/comments/:commentId', InteractionController.updateComment);
app.delete('/comments/:commentId', InteractionController.deleteComment);
app.get('/posts/:id/comments/count', InteractionController.getCommentsCount);

/* brisanje interakcija nakon brisanja objave */
app.delete('/interactions/by-post/:postId', InteractionController.deleteByPost);

app.listen(PORT, () => {
  console.log(`Interactions service running on port ${PORT}`);
});
