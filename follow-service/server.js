const express = require('express');
require('dotenv').config();
const db = require('./config/db');

// Uvozimo kontroler 
const FollowController = require('./controllers/FollowController');

const app = express();
app.use(express.json()); 

const PORT = process.env.PORT || 3004;

// Testna ruta provera
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS result');
    res.send(`Konekcija sa bazom uspešna! Rezultat: ${rows[0].result}`);
  } catch (err) {
    res.status(500).send(`Greška pri povezivanju sa bazom: ${err.message}`);
  }
});

// Rute za Praćenje i Blokiranje 
app.post('/follow', FollowController.followUser);             // Slanje zahteva
app.put('/follow/accept', FollowController.acceptFollow);      // Prihvatanje zahteva
app.delete('/follow/reject', FollowController.rejectFollow);   // Odbijanje zahteva
app.get('/follow/notifications', FollowController.getNotifications); // Lista zahteva
app.delete('/followers/remove', FollowController.removeFollower); // uklanjanje pratioca
app.get('/block-status', FollowController.getBlockStatus);        //blok status
app.get('/relationship-status', FollowController.getRelationshipStatus);  //follow status
app.delete('/unfollow', FollowController.unfollowUser);       // Prekid praćenja
app.post('/block', FollowController.blockUser);               // Blokiranje
app.get('/stats/:userId', FollowController.getStats);         // Statistika
app.get('/follow/following', FollowController.getFollowing);  // Lista koje pratiš
app.get('/follow/followers', FollowController.getFollowers);  // Lista ko te prati
//app.delete('/block', FollowController.unblockUser);           // odblokiranje
app.delete('/block/unblock', FollowController.unblockUser);   // odblokiranje
app.get('/block/blocked-list', FollowController.getBlockedList); //lista blokiranih

app.listen(PORT, () => {
  console.log(`Follow servis radi na portu ${PORT}`);
});