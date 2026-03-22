jest.mock('../models/FollowModel', () => ({
  isBlocked: jest.fn(),
  findFollow: jest.fn(),
  createFollow: jest.fn(),
  acceptPendingFollow: jest.fn(),
  rejectPendingFollow: jest.fn(),
  deleteFollow: jest.fn(),
  getPendingRequests: jest.fn(),
  createBlock: jest.fn(),
  removeFollowsOnBlock: jest.fn(),
  getFollowStats: jest.fn(),
  getFollowStatus: jest.fn(),
  getFollowingList: jest.fn(),    
  getFollowersList: jest.fn(),
}));

const FollowModel = require('../models/FollowModel');
const FollowController = require('../controllers/FollowController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('FollowController - unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = undefined;
  });

  // --------------------
  // followUser
  // --------------------
  describe('followUser', () => {
    test('400 ako fali follower_id ili following_id', async () => {
      const req = { body: { }, headers: {} };
      const res = mockRes();

      await FollowController.followUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
    });

    test('400 ako korisnik prati samog sebe', async () => {
      const req = { body: { following_id: '1' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.followUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('403 ako postoji blok između korisnika', async () => {
      FollowModel.isBlocked.mockResolvedValue(true);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { is_private: false } })
      });
      const req = { body: { following_id: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.followUser(req, res);

      expect(FollowModel.isBlocked).toHaveBeenCalledWith('1', '2');
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('400 ako follow relacija već postoji', async () => {
      FollowModel.isBlocked.mockResolvedValue(false);
      FollowModel.findFollow.mockResolvedValue({ follower_id: '1', following_id: '2' });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { is_private: false } })
      });
      const req = { body: { following_id: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.followUser(req, res);

      expect(FollowModel.findFollow).toHaveBeenCalledWith('1', '2');
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('kreira PENDING ako je profil privatan', async () => {
      FollowModel.isBlocked.mockResolvedValue(false);
      FollowModel.findFollow.mockResolvedValue(null);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { is_private: true } })
      });
      const req = { body: { following_id: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.followUser(req, res);

      expect(FollowModel.createFollow).toHaveBeenCalledWith('1', '2', 'PENDING');
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('kreira ACCEPTED ako je profil javan', async () => {
      FollowModel.isBlocked.mockResolvedValue(false);
      FollowModel.findFollow.mockResolvedValue(null);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { is_private: false } })
      });
      const req = { body: { following_id: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.followUser(req, res);

      expect(FollowModel.createFollow).toHaveBeenCalledWith('1', '2', 'ACCEPTED');
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('followUser -> 500 ako model baci grešku (npr. createFollow)', async () => {
      FollowModel.isBlocked.mockResolvedValue(false);
      FollowModel.findFollow.mockResolvedValue(null);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { is_private: false } })
      });
      FollowModel.createFollow.mockRejectedValue(new Error('DB fail'));

      const req = { body: { following_id: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.followUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB fail' });
    });

    test('followUser -> 400 ako korisnik ne postoji', async () => {
      FollowModel.isBlocked.mockResolvedValue(false);
      FollowModel.findFollow.mockResolvedValue(null);
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
      const req = { body: { following_id: '99' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.followUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Nevalidan following_id - korisnik ne postoji.' });
    });
  });

  // --------------------
  // acceptFollow
  // --------------------
  describe('acceptFollow', () => {
    test('200 ako je pending zahtev uspešno prihvaćen', async () => {
      FollowModel.acceptPendingFollow.mockResolvedValue({ affectedRows: 1 });
      const req = { body: { follower_id: '1' }, headers: { 'x-user-id': '2' } };
      const res = mockRes();

      await FollowController.acceptFollow(req, res);

      expect(FollowModel.acceptPendingFollow).toHaveBeenCalledWith('1', '2');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('404 ako pending zahtev ne postoji', async () => {
      FollowModel.acceptPendingFollow.mockResolvedValue({ affectedRows: 0 });
      const req = { body: { follower_id: '1' }, headers: { 'x-user-id': '2' } };
      const res = mockRes();

      await FollowController.acceptFollow(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('acceptFollow -> 500 ako model baci grešku', async () => {
      FollowModel.acceptPendingFollow.mockRejectedValue(new Error('DB fail'));
      const req = { body: { follower_id: '1' }, headers: { 'x-user-id': '2' } };
      const res = mockRes();

      await FollowController.acceptFollow(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB fail' });
    });
  });

  // --------------------
  // rejectFollow
  // --------------------
  describe('rejectFollow', () => {
    test('200 ako je pending zahtev uspešno odbijen', async () => {
      FollowModel.rejectPendingFollow.mockResolvedValue({ affectedRows: 1 });
      const req = { body: { follower_id: '1' }, headers: { 'x-user-id': '2' } };
      const res = mockRes();

      await FollowController.rejectFollow(req, res);

      expect(FollowModel.rejectPendingFollow).toHaveBeenCalledWith('1', '2');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('404 ako pending zahtev ne postoji', async () => {
      FollowModel.rejectPendingFollow.mockResolvedValue({ affectedRows: 0 });
      const req = { body: { follower_id: '1' }, headers: { 'x-user-id': '2' } };
      const res = mockRes();

      await FollowController.rejectFollow(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('rejectFollow -> 500 ako model baci grešku', async () => {
      FollowModel.rejectPendingFollow.mockRejectedValue(new Error('DB fail'));
      const req = { body: { follower_id: '1' }, headers: { 'x-user-id': '2' } };
      const res = mockRes();

      await FollowController.rejectFollow(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB fail' });
    });
  });

  // --------------------
  // getNotifications
  // --------------------
  describe('getNotifications', () => {
    test('200 vraća listu pending zahteva sa avatar i username', async () => {
      FollowModel.getPendingRequests.mockResolvedValue([{ follower_id: '5' }]);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { username: 'Nepoznat korisnik', profile_image_url: null } })
      });
      const req = { headers: { 'x-user-id': '2' } };
      const res = mockRes();

      await FollowController.getNotifications(req, res);

      expect(FollowModel.getPendingRequests).toHaveBeenCalledWith('2');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        pending_requests: [
          { follower_id: '5', username: 'Nepoznat korisnik', avatar: null }
        ]
      });
    });

    test('getNotifications -> 500 ako model baci grešku', async () => {
      FollowModel.getPendingRequests.mockRejectedValue(new Error('DB fail'));
      const req = { headers: { 'x-user-id': '2' } };
      const res = mockRes();

      await FollowController.getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB fail' });
    });
  });

  // --------------------
  // unfollowUser
  // --------------------
  describe('unfollowUser', () => {
    test('200 ako je otpraćivanje uspelo', async () => {
      FollowModel.deleteFollow.mockResolvedValue({ affectedRows: 1 });

      const req = { body: { following_id: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.unfollowUser(req, res);

      expect(FollowModel.deleteFollow).toHaveBeenCalledWith('1', '2');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('404 ako veza praćenja ne postoji', async () => {
      FollowModel.deleteFollow.mockResolvedValue({ affectedRows: 0 });

      const req = { body: { following_id: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.unfollowUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('unfollowUser -> 500 ako model baci grešku', async () => {
      FollowModel.deleteFollow.mockRejectedValue(new Error('DB fail'));

      const req = { body: { following_id: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.unfollowUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB fail' });
    });
  });

  // --------------------
  // removeFollower
  // --------------------
  describe('removeFollower', () => {
    test('200 ako je pratilac uklonjen', async () => {
      FollowModel.deleteFollow.mockResolvedValue({ affectedRows: 1 });

      const req = { body: { follower_id: '1' }, headers: { 'x-user-id': '2' } };
      const res = mockRes();

      await FollowController.removeFollower(req, res);

      expect(FollowModel.deleteFollow).toHaveBeenCalledWith('1', '2');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // --------------------
  // blockUser
  // --------------------
  describe('blockUser', () => {
    test('400 ako fali blocker_id ili blocked_id', async () => {
      const req = { body: { }, headers: {} };
      const res = mockRes();

      await FollowController.blockUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('400 ako korisnik blokira samog sebe', async () => {
      const req = { body: { blocked_id: '1' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.blockUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('201 ako blok uspe i follow veze se obrišu', async () => {
      FollowModel.createBlock.mockResolvedValue({});
      FollowModel.removeFollowsOnBlock.mockResolvedValue({});

      const req = { body: { blocked_id: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.blockUser(req, res);

      expect(FollowModel.createBlock).toHaveBeenCalledWith('1', '2');
      expect(FollowModel.removeFollowsOnBlock).toHaveBeenCalledWith('1', '2');
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('400 ako je korisnik već blokiran (ER_DUP_ENTRY)', async () => {
      FollowModel.createBlock.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

      const req = { body: { blocked_id: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.blockUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // --------------------
  // getStats
  // --------------------
  describe('getStats', () => {
    test('200 vraća followers/following', async () => {
      FollowModel.getFollowStats.mockResolvedValue({ followers: 3, following: 10 });

      const req = { headers: { 'x-user-id': '7' } };
      const res = mockRes();

      await FollowController.getStats(req, res);

      expect(FollowModel.getFollowStats).toHaveBeenCalledWith('7');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ followers: 3, following: 10 });
    });

    test('getStats -> 500 ako model baci grešku', async () => {
      FollowModel.getFollowStats.mockRejectedValue(new Error('DB fail'));

      const req = { headers: { 'x-user-id': '7' } };
      const res = mockRes();

      await FollowController.getStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB fail' });
    });
  });

  // --------------------
  // getBlockStatus
  // --------------------
  describe('getBlockStatus', () => {
    test('200 vraća blocked true/false', async () => {
      FollowModel.isBlocked.mockResolvedValue(true);

      const req = { query: { userB: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.getBlockStatus(req, res);

      expect(FollowModel.isBlocked).toHaveBeenCalledWith('1', '2');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ blocked: true });
    });

    test('getBlockStatus -> 500 ako model baci grešku', async () => {
      FollowModel.isBlocked.mockRejectedValue(new Error('DB fail'));

      const req = { query: { userB: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.getBlockStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB fail' });
    });
  });
  
  describe('getFollowing', () => {
    test('200 vraća listu following korisnika', async () => {
      FollowModel.getFollowingList.mockResolvedValue(['2', '3']);
      const req = { headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.getFollowing(req, res);

      expect(FollowModel.getFollowingList).toHaveBeenCalledWith('1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ following: ['2', '3'] });
    });

    test('500 na grešku modela', async () => {
      FollowModel.getFollowingList.mockRejectedValue(new Error('DB fail'));
      const req = { headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.getFollowing(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB fail' });
    });
  });

  describe('getFollowers', () => {
    test('200 vraća listu followers korisnika', async () => {
      FollowModel.getFollowersList.mockResolvedValue(['2', '5']);
      const req = { headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.getFollowers(req, res);

      expect(FollowModel.getFollowersList).toHaveBeenCalledWith('1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ followers: ['2', '5'] });
    });

    test('500 na grešku modela', async () => {
      FollowModel.getFollowersList.mockRejectedValue(new Error('DB fail'));
      const req = { headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.getFollowers(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB fail' });
    });
  });

  describe('getRelationshipStatus', () => {
    test('200 vraća blocked + followStatus', async () => {
      FollowModel.isBlocked.mockResolvedValue(false);
      FollowModel.getFollowStatus.mockResolvedValue('ACCEPTED');

      const req = { query: { following_id: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.getRelationshipStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ blocked: false, followStatus: 'ACCEPTED' });
    });

    test('getRelationshipStatus -> 500 ako model baci grešku', async () => {
      FollowModel.isBlocked.mockRejectedValue(new Error('DB fail'));

      const req = { query: { following_id: '2' }, headers: { 'x-user-id': '1' } };
      const res = mockRes();

      await FollowController.getRelationshipStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB fail' });
    });
  });
});