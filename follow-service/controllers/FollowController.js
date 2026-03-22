const FollowModel = require('../models/FollowModel');

const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || 'http://profile:3010';

async function getProfilePrivacyStatus(userId, req) {
  try {
    const response = await fetch(`${PROFILE_SERVICE_URL}/users/${userId}`, {
      method: 'GET',
      headers: {
        'x-user-id': req.headers['x-user-id'],
        'x-username': req.headers['x-username'] || '',
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      if (response.status === 404) throw new Error('Korisnik ne postoji!');
      throw new Error(`Profile servis vratio status: ${response.status}`);
    }
    const data = await response.json();
    return data.user?.is_private || false;
  } catch (err) {
    console.error('[FollowController] Profile info greška:', err.message);
    throw err;
  }
}

const FollowController = {

  async followUser(req, res) {
    const follower_id = req.headers['x-user-id'];
    const following_id = req.body.following_id;
    if (!follower_id || !following_id) return res.status(400).json({ error: 'follower_id i following_id su obavezni.' });
    if (follower_id === following_id) return res.status(400).json({ error: 'Ne možete pratiti sami sebe.' });
    try {
      try { await getProfilePrivacyStatus(following_id, req); }
      catch (err) { return res.status(400).json({ error: 'Nevalidan following_id - korisnik ne postoji.' }); }

      const blocked = await FollowModel.isBlocked(follower_id, following_id);
      if (blocked) return res.status(403).json({ error: 'Praćenje nije dozvoljeno jer postoji blokada.' });

      const existingFollow = await FollowModel.findFollow(follower_id, following_id);
      if (existingFollow) return res.status(400).json({ error: 'Već postoji zahtev ili veza praćenja.' });

      let isPrivate;
      try { isPrivate = await getProfilePrivacyStatus(following_id, req); }
      catch (err) { isPrivate = true; }

      const status = isPrivate ? 'PENDING' : 'ACCEPTED';
      await FollowModel.createFollow(follower_id, following_id, status);
      return res.status(201).json({
        message: status === 'PENDING' ? 'Zahtev za praćenje poslat.' : 'Uspešno zapraćeno.',
        status
      });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  },

  async acceptFollow(req, res) {
    const following_id = req.headers['x-user-id'];
    const follower_id = req.body.follower_id;
    if (!follower_id || !following_id) return res.status(400).json({ error: 'follower_id i following_id obavezni.' });
    try {
      const result = await FollowModel.acceptPendingFollow(follower_id, following_id);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Pending zahtev nije pronađen.' });
      return res.status(200).json({ message: 'Zahtev prihvaćen.' });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  },

  async rejectFollow(req, res) {
    const following_id = req.headers['x-user-id'];
    const follower_id = req.body.follower_id;
    if (!follower_id || !following_id) return res.status(400).json({ error: 'follower_id i following_id obavezni.' });
    try {
      const result = await FollowModel.rejectPendingFollow(follower_id, following_id);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Pending zahtev nije pronađen.' });
      return res.status(200).json({ message: 'Zahtev odbijen.' });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  },

  async getNotifications(req, res) {
    const userId = req.headers['x-user-id'];
    try {
      const requests = await FollowModel.getPendingRequests(userId);
      const obogaceniZahtevi = await Promise.all(requests.map(async (zahtev) => {
        try {
          const response = await fetch(`${PROFILE_SERVICE_URL}/users/${zahtev.follower_id}`, {
            headers: { 'x-user-id': userId }
          });
          if (response.ok) {
            const profileData = await response.json();
            return { ...zahtev, username: profileData.user.username, avatar: profileData.user.profile_image_url || null };
          }
        } catch (err) { console.error("Greska pri povlacenju profila za notifikaciju", err); }
        return { ...zahtev, username: "Nepoznat korisnik", avatar: null };
      }));
      return res.status(200).json({ pending_requests: obogaceniZahtevi });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  },

  async unfollowUser(req, res) {
    const follower_id = req.headers['x-user-id'];
    const following_id = req.body.following_id;
    if (!follower_id || !following_id) return res.status(400).json({ error: 'follower_id i following_id obavezni.' });
    try {
      const result = await FollowModel.deleteFollow(follower_id, following_id);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Veza praćenja nije pronađena.' });
      return res.status(200).json({ message: 'Uspešno otpraćeno.' });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  },

  async removeFollower(req, res) {
    const profile_id = req.headers['x-user-id'];
    const follower_id = req.body.follower_id;
    if (!profile_id || !follower_id) return res.status(400).json({ error: 'profile_id i follower_id obavezni.' });
    try {
      const result = await FollowModel.deleteFollow(follower_id, profile_id);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Pratilac nije pronađen.' });
      return res.status(200).json({ message: 'Pratilac je uklonjen.' });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  },

  async blockUser(req, res) {
    const blocker_id = req.headers['x-user-id'];
    const blocked_id = req.body.blocked_id;
    if (!blocker_id || !blocked_id) return res.status(400).json({ error: 'blocker_id i blocked_id obavezni.' });
    if (blocker_id === blocked_id) return res.status(400).json({ error: 'Ne možete blokirati sami sebe.' });
    try {
      await FollowModel.createBlock(blocker_id, blocked_id);
      await FollowModel.removeFollowsOnBlock(blocker_id, blocked_id);
      return res.status(201).json({ message: 'Korisnik je blokiran i follow veze su uklonjene.' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Korisnik je već blokiran.' });
      return res.status(500).json({ error: err.message });
    }
  },

  // NEW: Unblock user
  async unblockUser(req, res) {
    const blocker_id = req.headers['x-user-id'];
    const blocked_id = req.body.blocked_id;
    if (!blocker_id || !blocked_id) return res.status(400).json({ error: 'blocker_id i blocked_id obavezni.' });
    try {
      const result = await FollowModel.deleteBlock(blocker_id, blocked_id);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Blokada nije pronađena.' });
      return res.status(200).json({ message: 'Korisnik je odblokirani.' });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  },

  // NEW: Get list of blocked users with their profile info
  async getBlockedList(req, res) {
    const userId = req.headers['x-user-id'];
    try {
      const blockedIds = await FollowModel.getBlockedList(userId);
      // Fetch profile info for each blocked user
      const blockedUsers = await Promise.all(blockedIds.map(async (blockedId) => {
        try {
          const response = await fetch(`${PROFILE_SERVICE_URL}/users/${blockedId}`, {
            headers: { 'x-user-id': userId }
          });
          if (response.ok) {
            const data = await response.json();
            return {
              id: data.user.id,
              username: data.user.username,
              first_name: data.user.first_name,
              last_name: data.user.last_name,
              profile_image_url: data.user.profile_image_url || null
            };
          }
        } catch (err) { console.error('Greška pri povlačenju profila blokiranog korisnika:', err); }
        return { id: blockedId, username: 'Nepoznat', first_name: '', last_name: '', profile_image_url: null };
      }));
      return res.status(200).json({ blocked: blockedUsers });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  },

  async getStats(req, res) {
    const userId = req.headers['x-user-id'];
    try {
      const stats = await FollowModel.getFollowStats(userId);
      return res.status(200).json(stats);
    } catch (err) { return res.status(500).json({ error: err.message }); }
  },

  async getBlockStatus(req, res) {
    const userA = req.headers['x-user-id'];
    const userB = req.query.userB;
    try {
      const blocked = await FollowModel.isBlocked(userA, userB);
      return res.status(200).json({ blocked });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  },

  async getFollowing(req, res) {
    const userId = req.headers['x-user-id'];
    try {
      const following = await FollowModel.getFollowingList(userId);
      return res.status(200).json({ following });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  },

  async getFollowers(req, res) {
    const userId = req.headers['x-user-id'];
    try {
      const followers = await FollowModel.getFollowersList(userId);
      return res.status(200).json({ followers });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  },

  async getRelationshipStatus(req, res) {
    const follower_id = req.headers['x-user-id'];
    const following_id = req.query.following_id;
    try {
      const blocked = await FollowModel.isBlocked(follower_id, following_id);
      const followStatus = await FollowModel.getFollowStatus(follower_id, following_id);
      return res.status(200).json({ blocked, followStatus });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }
};

module.exports = FollowController;