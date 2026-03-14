jest.mock('../config/db', () => ({
  query: jest.fn()
}));

const db = require('../config/db');
const FollowModel = require('../models/FollowModel');

describe('FollowModel - unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createFollow poziva ispravan SQL', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);
    await FollowModel.createFollow('1', '2', 'ACCEPTED');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO follows'),
      ['1', '2', 'ACCEPTED']
    );
  });

  test('findFollow vraća prvi rezultat ili null', async () => {
    db.query.mockResolvedValue([[{ follower_id: '1', following_id: '2' }]]);
    let res = await FollowModel.findFollow('1', '2');
    expect(res).toEqual({ follower_id: '1', following_id: '2' });

    db.query.mockResolvedValue([[]]);
    res = await FollowModel.findFollow('1', '2');
    expect(res).toBeNull();
  });

  test('acceptPendingFollow menja status', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);
    const result = await FollowModel.acceptPendingFollow('1', '2');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE follows'),
      ['1', '2']
    );
    expect(result).toEqual({ affectedRows: 1 });
  });

  test('rejectPendingFollow briše pending', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);
    const result = await FollowModel.rejectPendingFollow('1', '2');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM follows'),
      ['1', '2']
    );
    expect(result).toEqual({ affectedRows: 1 });
  });

  test('deleteFollow briše follow relaciju', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);
    const result = await FollowModel.deleteFollow('1', '2');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM follows'),
      ['1', '2']
    );
    expect(result).toEqual({ affectedRows: 1 });
  });

  test('getPendingRequests vraća listu zahteva', async () => {
    const rows = [{ follower_id: '3', created_at: '2024-05-01' }];
    db.query.mockResolvedValue([rows]);
    const result = await FollowModel.getPendingRequests('2');
    expect(result).toEqual(rows);
    expect(db.query).toHaveBeenCalled();
  });

  test('createBlock poziva ispravan SQL', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);
    await FollowModel.createBlock('1', '2');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO blocks'),
      ['1', '2']
    );
  });

  test('isBlocked daje true/false', async () => {
    db.query.mockResolvedValue([[{ 1: 1 }]]);
    let res = await FollowModel.isBlocked('1', '2');
    expect(res).toBe(true);

    db.query.mockResolvedValue([[]]);
    res = await FollowModel.isBlocked('1', '2');
    expect(res).toBe(false);
  });

  test('removeFollowsOnBlock briše u oba smera', async () => {
    db.query.mockResolvedValue([{ affectedRows: 2 }]);
    await FollowModel.removeFollowsOnBlock('1', '2');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM follows'),
      ['1', '2', '2', '1']
    );
  });

  test('getFollowStats vraća followers/following', async () => {
    db.query
      .mockResolvedValueOnce([[{ count: 4 }]]) // followers
      .mockResolvedValueOnce([[{ count: 2 }]]); // following
    const stats = await FollowModel.getFollowStats('10');
    expect(stats).toEqual({ followers: 4, following: 2 });
  });

  test('getFollowingList vraća ID-jeve koje pratiš', async () => {
    const rows = [{ userId: '2' }, { userId: '5' }];
    db.query.mockResolvedValue([rows]);
    const result = await FollowModel.getFollowingList('1');
    expect(result).toEqual(['2', '5']);
  });

  test('getFollowersList vraća ID-jeve koji te prate', async () => {
    const rows = [{ userId: '7' }, { userId: '8' }];
    db.query.mockResolvedValue([rows]);
    const result = await FollowModel.getFollowersList('1');
    expect(result).toEqual(['7', '8']);
  });

  test('getFollowStatus vraća status ili NONE', async () => {
    db.query.mockResolvedValue([[{ status: 'ACCEPTED' }]]);
    let res = await FollowModel.getFollowStatus('1', '2');
    expect(res).toBe('ACCEPTED');

    db.query.mockResolvedValue([[]]);
    res = await FollowModel.getFollowStatus('1', '2');
    expect(res).toBe('NONE');
  });

});