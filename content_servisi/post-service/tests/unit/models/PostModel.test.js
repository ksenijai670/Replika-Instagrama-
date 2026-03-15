jest.mock("../../../config/db", () => ({
  execute: jest.fn(),
}));

const db = require("../../../config/db");
const PostModel = require("../../../models/PostModel");

describe("PostModel - unit tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("createPost vraca insertId", async () => {
    db.execute.mockResolvedValue([{ insertId: 10 }]);

    const result = await PostModel.createPost(1, "opis");

    expect(db.execute).toHaveBeenCalledWith(
      "INSERT INTO posts (user_id, caption) VALUES (?, ?)",
      [1, "opis"]
    );
    expect(result).toBe(10);
  });

  test("addMedia vraca insertId", async () => {
    db.execute.mockResolvedValue([{ insertId: 20 }]);

    const result = await PostModel.addMedia(10, 0, "a.png", "image", 123);

    expect(result).toBe(20);
  });

  test("getPostById vraca post", async () => {
    const row = { id: 1, user_id: 2, caption: "opis" };
    db.execute.mockResolvedValue([[row]]);

    const result = await PostModel.getPostById(1);

    expect(result).toEqual(row);
  });

  test("getPostById vraca null kada post ne postoji", async () => {
    db.execute.mockResolvedValue([[]]);

    const result = await PostModel.getPostById(1);

    expect(result).toBeNull();
  });

  test("getPostMedia vraca medije", async () => {
    const rows = [{ id: 1, post_id: 10, media_key: "a.png" }];
    db.execute.mockResolvedValue([rows]);

    const result = await PostModel.getPostMedia(10);

    expect(result).toEqual(rows);
  });

  test("getFullPostById vraca null kada post ne postoji", async () => {
    db.execute.mockResolvedValueOnce([[]]);

    const result = await PostModel.getFullPostById(10);

    expect(result).toBeNull();
  });

  test("getFullPostById vraca post sa medijima", async () => {
    db.execute
      .mockResolvedValueOnce([[
        {
          id: 10,
          user_id: 2,
          caption: "opis",
          created_at: "2025-01-01",
          updated_at: "2025-01-01",
        },
      ]])
      .mockResolvedValueOnce([[
        {
          id: 1,
          post_id: 10,
          position: 0,
          media_key: "a.png",
          media_type: "image",
          media_size_bytes: 100,
          created_at: "2025-01-01",
        },
      ]]);

    const result = await PostModel.getFullPostById(10);

    expect(result).toEqual({
      id: 10,
      userId: 2,
      caption: "opis",
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
      media: [
        {
          id: 1,
          post_id: 10,
          position: 0,
          media_key: "a.png",
          media_type: "image",
          media_size_bytes: 100,
          created_at: "2025-01-01",
        },
      ],
    });
  });

  test("getPostsByUserId vraca objave korisnika sa medijima", async () => {
    db.execute
      .mockResolvedValueOnce([[
        {
          id: 1,
          user_id: 2,
          caption: "prva",
          created_at: "2025-01-01",
          updated_at: "2025-01-01",
        },
        {
          id: 2,
          user_id: 2,
          caption: "druga",
          created_at: "2025-01-02",
          updated_at: "2025-01-02",
        },
      ]])
      .mockResolvedValueOnce([[{ id: 11, post_id: 1, media_key: "a.png" }]])
      .mockResolvedValueOnce([[{ id: 22, post_id: 2, media_key: "b.png" }]]);

    const result = await PostModel.getPostsByUserId(2);

    expect(result).toEqual([
      {
        id: 1,
        userId: 2,
        caption: "prva",
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
        media: [{ id: 11, post_id: 1, media_key: "a.png" }],
      },
      {
        id: 2,
        userId: 2,
        caption: "druga",
        createdAt: "2025-01-02",
        updatedAt: "2025-01-02",
        media: [{ id: 22, post_id: 2, media_key: "b.png" }],
      },
    ]);
  });

  test("updateCaption vraca true kada je uspelo", async () => {
    db.execute.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await PostModel.updateCaption(10, "novo");

    expect(result).toBe(true);
  });

  test("deletePost vraca true kada je uspelo", async () => {
    db.execute.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await PostModel.deletePost(10);

    expect(result).toBe(true);
  });

  test("getMediaById vraca media zapis", async () => {
    const row = { id: 5, post_id: 10, media_key: "a.png" };
    db.execute.mockResolvedValue([[row]]);

    const result = await PostModel.getMediaById(5);

    expect(result).toEqual(row);
  });

  test("deleteMediaById vraca true kada je uspelo", async () => {
    db.execute.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await PostModel.deleteMediaById(5);

    expect(result).toBe(true);
  });
});