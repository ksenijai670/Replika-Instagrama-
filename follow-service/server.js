const express = require('express');
require('dotenv').config();
const db = require('./config/db');
const FollowController = require('./controllers/FollowController');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3004;

app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS result');
    res.send(`Konekcija sa bazom uspešna! Rezultat: ${rows[0].result}`);
  } catch (err) {
    res.status(500).send(`Greška pri povezivanju sa bazom: ${err.message}`);
  }
});

// ─── Follow ───────────────────────────────────────────────
app.post('/follow', FollowController.followUser);
app.put('/follow/accept', FollowController.acceptFollow);
app.delete('/follow/reject', FollowController.rejectFollow);
app.get('/follow/notifications/:userId', FollowController.getNotifications);
app.get('/follow/following', FollowController.getFollowing);
app.get('/follow/followers', FollowController.getFollowers);
app.delete('/followers/remove', FollowController.removeFollower);

// ─── Block ────────────────────────────────────────────────
app.post('/block', FollowController.blockUser);
app.delete('/block', FollowController.unblockUser);           // NEW: unblock
app.delete('/block/unblock', FollowController.unblockUser);   // NEW: alias
app.get('/block/blocked-list', FollowController.getBlockedList); // NEW: list
app.get('/block-status', FollowController.getBlockStatus);

// ─── Stats / Relationship ─────────────────────────────────
app.get('/stats/:userId', FollowController.getStats);
app.get('/relationship-status', FollowController.getRelationshipStatus);

// ─── Unfollow ─────────────────────────────────────────────
app.delete('/unfollow', FollowController.unfollowUser);

app.listen(PORT, () => {
  console.log(`Follow servis radi na portu ${PORT}`);
});