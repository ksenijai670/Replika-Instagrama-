process.env.MINIO_BUCKET = "posts";
process.env.MINIO_PUBLIC_URL = "http://localhost:9000";
process.env.INTERACTIONS_SERVICE_URL = "http://interactions-service:3005";
process.env.MAX_FILES = "20";

beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  console.error.mockRestore();
});

jest.mock("node-fetch", () => jest.fn());
jest.mock("../../../config/minio", () => ({
  putObject: jest.fn(),
  removeObject: jest.fn(),
}));
jest.mock("../../../config/db", () => ({
  getConnection: jest.fn(),
}));
jest.mock("../../../models/PostModel", () => ({
  createPost: jest.fn(),
  addMedia: jest.fn(),
  getFullPostById: jest.fn(),
  getPostById: jest.fn(),
  getPostsByUserId: jest.fn(),
  updateCaption: jest.fn(),
  getPostMedia: jest.fn(),
  deletePost: jest.fn(),
  getMediaById: jest.fn(),
  deleteMediaById: jest.fn(),
}));

const fetch = require("node-fetch");
const minioClient = require("../../../config/minio");
const db = require("../../../config/db");
const PostModel = require("../../../models/PostModel");
const PostController = require("../../../controllers/PostController");

function mockReq({
  params = {},
  body = {},
  headers = {},
  files = [],
} = {}) {
  return { params, body, headers, files };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("PostController - unit tests", () => {
  let conn;

  beforeEach(() => {
    jest.clearAllMocks();

    conn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn(),
      execute: jest.fn(),
    };

    db.getConnection.mockResolvedValue(conn);
  });

  describe("createPost", () => {
    test("401 ako nema validan x-user-id", async () => {
      const req = mockReq({
        body: { caption: "tekst" },
        files: [
          {
            mimetype: "image/png",
            originalname: "a.png",
            buffer: Buffer.from("1"),
            size: 10,
          },
        ],
      });
      const res = mockRes();

      await PostController.createPost(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("400 ako nema fajlova", async () => {
      const req = mockReq({
        headers: { "x-user-id": "1" },
        body: { caption: "tekst" },
        files: [],
      });
      const res = mockRes();

      await PostController.createPost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Potreban bar 1 fajl" });
    });

    test("400 ako mime nije dozvoljen", async () => {
      const req = mockReq({
        headers: { "x-user-id": "1" },
        files: [
          {
            mimetype: "application/pdf",
            originalname: "a.pdf",
            buffer: Buffer.from("1"),
            size: 10,
          },
        ],
      });
      const res = mockRes();

      await PostController.createPost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Samo slike i videi su dozvoljeni",
      });
    });

    test("201 uspesno kreira objavu", async () => {
      PostModel.createPost.mockResolvedValue(100);
      PostModel.addMedia.mockResolvedValue(200);
      PostModel.getFullPostById.mockResolvedValue({
        id: 100,
        userId: 1,
        caption: "opis",
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
        media: [
          {
            id: 200,
            post_id: 100,
            position: 0,
            media_key: "file-1.png",
            media_type: "image",
            media_size_bytes: 123,
            created_at: "2025-01-01",
          },
        ],
      });

      const req = mockReq({
        headers: { "x-user-id": "1" },
        body: { caption: "opis" },
        files: [
          {
            mimetype: "image/png",
            originalname: "slika.png",
            buffer: Buffer.from("test"),
            size: 123,
          },
        ],
      });
      const res = mockRes();

      await PostController.createPost(req, res);

      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(PostModel.createPost).toHaveBeenCalledWith(1, "opis", conn);
      expect(minioClient.putObject).toHaveBeenCalled();
      expect(PostModel.addMedia).toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test("500 ako upload pukne", async () => {
      PostModel.createPost.mockResolvedValue(100);
      minioClient.putObject.mockRejectedValue(new Error("minio error"));

      const req = mockReq({
        headers: { "x-user-id": "1" },
        body: { caption: "opis" },
        files: [
          {
            mimetype: "image/png",
            originalname: "slika.png",
            buffer: Buffer.from("test"),
            size: 123,
          },
        ],
      });
      const res = mockRes();

      await PostController.createPost(req, res);

      expect(conn.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getPostMeta", () => {
    test("404 ako post ne postoji", async () => {
      PostModel.getPostById.mockResolvedValue(null);

      const req = mockReq({ params: { id: "5" } });
      const res = mockRes();

      await PostController.getPostMeta(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("vraca metadata za objavu", async () => {
      PostModel.getPostById.mockResolvedValue({
        id: 5,
        user_id: 10,
      });

      const req = mockReq({ params: { id: "5" } });
      const res = mockRes();

      await PostController.getPostMeta(req, res);

      expect(res.json).toHaveBeenCalledWith({
        id: 5,
        userId: 10,
      });
    });
  });

  describe("getPostById", () => {
    test("404 ako objava ne postoji", async () => {
      PostModel.getFullPostById.mockResolvedValue(null);

      const req = mockReq({ params: { id: "5" } });
      const res = mockRes();

      await PostController.getPostById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("vraca mapiran post", async () => {
      PostModel.getFullPostById.mockResolvedValue({
        id: 5,
        userId: 10,
        caption: "opis",
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
        media: [
          {
            id: 1,
            post_id: 5,
            position: 0,
            media_key: "abc.png",
            media_type: "image",
            media_size_bytes: 100,
            created_at: "2025-01-01",
          },
        ],
      });

      const req = mockReq({ params: { id: "5" } });
      const res = mockRes();

      await PostController.getPostById(req, res);

      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("getPostsByUserId", () => {
    test("400 za nevalidan userId", async () => {
      const req = mockReq({ params: { userId: "abc" } });
      const res = mockRes();

      await PostController.getPostsByUserId(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("vraca listu objava korisnika", async () => {
      PostModel.getPostsByUserId.mockResolvedValue([
        {
          id: 1,
          userId: 2,
          caption: "opis",
          createdAt: "2025-01-01",
          updatedAt: "2025-01-01",
          media: [],
        },
      ]);

      const req = mockReq({ params: { userId: "2" } });
      const res = mockRes();

      await PostController.getPostsByUserId(req, res);

      expect(res.json).toHaveBeenCalledWith([
        {
          id: 1,
          userId: 2,
          caption: "opis",
          createdAt: "2025-01-01",
          updatedAt: "2025-01-01",
          media: [],
        },
      ]);
    });
  });

  describe("updateCaption", () => {
    test("401 ako nema validan x-user-id", async () => {
      const req = mockReq({
        params: { id: "5" },
        body: { caption: "novo" },
      });
      const res = mockRes();

      await PostController.updateCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("404 ako post ne postoji", async () => {
      PostModel.getPostById.mockResolvedValue(null);

      const req = mockReq({
        params: { id: "5" },
        body: { caption: "novo" },
        headers: { "x-user-id": "1" },
      });
      const res = mockRes();

      await PostController.updateCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("403 ako korisnik nije vlasnik", async () => {
      PostModel.getPostById.mockResolvedValue({
        id: 5,
        user_id: 2,
      });

      const req = mockReq({
        params: { id: "5" },
        body: { caption: "novo" },
        headers: { "x-user-id": "1" },
      });
      const res = mockRes();

      await PostController.updateCaption(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test("uspesno menja caption", async () => {
      PostModel.getPostById.mockResolvedValue({
        id: 5,
        user_id: 1,
      });
      PostModel.updateCaption.mockResolvedValue(true);
      PostModel.getFullPostById.mockResolvedValue({
        id: 5,
        userId: 1,
        caption: "novo",
        createdAt: "2025-01-01",
        updatedAt: "2025-01-02",
        media: [],
      });

      const req = mockReq({
        params: { id: "5" },
        body: { caption: "novo" },
        headers: { "x-user-id": "1" },
      });
      const res = mockRes();

      await PostController.updateCaption(req, res);

      expect(res.json).toHaveBeenCalledWith({
        id: 5,
        userId: 1,
        caption: "novo",
        createdAt: "2025-01-01",
        updatedAt: "2025-01-02",
        media: [],
      });
    });
  });

  describe("deletePost", () => {
    test("403 ako korisnik nije vlasnik", async () => {
      PostModel.getPostById.mockResolvedValue({
        id: 5,
        user_id: 2,
      });

      const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1" },
      });
      const res = mockRes();

      await PostController.deletePost(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test("uspesno brise objavu", async () => {
      PostModel.getPostById.mockResolvedValue({
        id: 5,
        user_id: 1,
      });
      PostModel.getPostMedia.mockResolvedValue([
        { media_key: "a.png" },
        { media_key: "b.png" },
      ]);
      PostModel.deletePost.mockResolvedValue(true);

      fetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      minioClient.removeObject.mockResolvedValue();

      const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1" },
      });
      const res = mockRes();

      await PostController.deletePost(req, res);

      expect(PostModel.deletePost).toHaveBeenCalledWith(5);
      expect(fetch).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: "Uspešno brisanje objave",
      });
    });

    test("500 ako interaction servis vrati gresku", async () => {
      PostModel.getPostById.mockResolvedValue({
        id: 5,
        user_id: 1,
      });
      PostModel.getPostMedia.mockResolvedValue([]);
      PostModel.deletePost.mockResolvedValue(true);

      fetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1" },
      });
      const res = mockRes();

      await PostController.deletePost(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deletePostMedia", () => {
    test("404 ako media ne postoji", async () => {
      PostModel.getPostById.mockResolvedValue({
        id: 5,
        user_id: 1,
      });
      PostModel.getMediaById.mockResolvedValue(null);

      const req = mockReq({
        params: { id: "5", mediaId: "2" },
        headers: { "x-user-id": "1" },
      });
      const res = mockRes();

      await PostController.deletePostMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("400 ako media ne pripada toj objavi", async () => {
      PostModel.getPostById.mockResolvedValue({
        id: 5,
        user_id: 1,
      });
      PostModel.getMediaById.mockResolvedValue({
        id: 2,
        post_id: 7,
        media_key: "a.png",
      });

      const req = mockReq({
        params: { id: "5", mediaId: "2" },
        headers: { "x-user-id": "1" },
      });
      const res = mockRes();

      await PostController.deletePostMedia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("uspesno brise media zapis i fajl", async () => {
      PostModel.getPostById.mockResolvedValue({
        id: 5,
        user_id: 1,
      });
      PostModel.getMediaById.mockResolvedValue({
        id: 2,
        post_id: 5,
        media_key: "a.png",
      });
      minioClient.removeObject.mockResolvedValue();
      PostModel.deleteMediaById.mockResolvedValue(true);

      const req = mockReq({
        params: { id: "5", mediaId: "2" },
        headers: { "x-user-id": "1" },
      });
      const res = mockRes();

      await PostController.deletePostMedia(req, res);

      expect(PostModel.deleteMediaById).toHaveBeenCalledWith(2);
      expect(res.json).toHaveBeenCalledWith({
        message: "Uspešno brisanje medije",
      });
    });
  });
});