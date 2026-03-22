jest.mock("../../../config/db", () => ({
  execute: jest.fn(),
}));

const db = require("../../../config/db");
const InteractionModel = require("../../../models/InteractionModel");

describe("InteractionModel - unit tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("addLike poziva ispravan SQL", async () => {
    db.execute.mockResolvedValue([{ affectedRows: 1 }]);

    await InteractionModel.addLike(1, 10);

    expect(db.execute).toHaveBeenCalledWith(
      "INSERT INTO likes (user_id, post_id) VALUES (?, ?)",
      [1, 10]
    );
  });

  test("removeLike vraca true kada je nesto obrisano", async () => {
    db.execute.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await InteractionModel.removeLike(1, 10);

    expect(result).toBe(true);
  });

  test("removeLike vraca false kada nista nije obrisano", async () => {
    db.execute.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await InteractionModel.removeLike(1, 10);

    expect(result).toBe(false);
  });

  test("likeExists vraca true kada postoji lajk", async () => {
    db.execute.mockResolvedValue([[{ 1: 1 }]]);

    const result = await InteractionModel.likeExists(1, 10);

    expect(result).toBe(true);
  });

  test("likeExists vraca false kada lajk ne postoji", async () => {
    db.execute.mockResolvedValue([[]]);

    const result = await InteractionModel.likeExists(1, 10);

    expect(result).toBe(false);
  });

  test("getLikesCount vraca count", async () => {
    db.execute.mockResolvedValue([[{ count: 3 }]]);

    const result = await InteractionModel.getLikesCount(10);

    expect(result).toBe(3);
  });

  test("getLikesByPostId vraca redove", async () => {
    const rows = [{ user_id: 1, post_id: 10 }];
    db.execute.mockResolvedValue([rows]);

    const result = await InteractionModel.getLikesByPostId(10);

    expect(result).toEqual(rows);
  });

  test("addComment vraca insertId", async () => {
    db.execute.mockResolvedValue([{ insertId: 55 }]);

    const result = await InteractionModel.addComment(1, 10, "tekst");

    expect(result).toBe(55);
  });

  test("getCommentById vraca komentar", async () => {
    const row = { id: 1, user_id: 2, post_id: 10, content: "tekst" };
    db.execute.mockResolvedValue([[row]]);

    const result = await InteractionModel.getCommentById(1);

    expect(result).toEqual(row);
  });

  test("getCommentById vraca null kada komentar ne postoji", async () => {
    db.execute.mockResolvedValue([[]]);

    const result = await InteractionModel.getCommentById(1);

    expect(result).toBeNull();
  });

  test("updateComment vraca true kada je komentar azuriran", async () => {
    db.execute.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await InteractionModel.updateComment(1, "novo");

    expect(result).toBe(true);
  });

  test("updateComment vraca false kada komentar nije azuriran", async () => {
    db.execute.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await InteractionModel.updateComment(1, "novo");

    expect(result).toBe(false);
  });

  test("deleteComment vraca true kada je komentar obrisan", async () => {
    db.execute.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await InteractionModel.deleteComment(1);

    expect(result).toBe(true);
  });

  test("deleteComment vraca false kada komentar nije obrisan", async () => {
    db.execute.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await InteractionModel.deleteComment(1);

    expect(result).toBe(false);
  });

  test("getCommentsByPostId vraca listu komentara", async () => {
    const rows = [{ id: 1, user_id: 2, post_id: 10 }];
    db.execute.mockResolvedValue([rows]);

    const result = await InteractionModel.getCommentsByPostId(10);

    expect(result).toEqual(rows);
  });

  test("getCommentsCount vraca count", async () => {
    db.execute.mockResolvedValue([[{ count: 4 }]]);

    const result = await InteractionModel.getCommentsCount(10);

    expect(result).toBe(4);
  });

  test("deleteInteractionsByPostId brise lajkove pa komentare", async () => {
    db.execute.mockResolvedValue([{ affectedRows: 1 }]);

    await InteractionModel.deleteInteractionsByPostId(10);

    expect(db.execute).toHaveBeenNthCalledWith(
      1,
      "DELETE FROM likes WHERE post_id = ?",
      [10]
    );
    expect(db.execute).toHaveBeenNthCalledWith(
      2,
      "DELETE FROM comments WHERE post_id = ?",
      [10]
    );
  });
});