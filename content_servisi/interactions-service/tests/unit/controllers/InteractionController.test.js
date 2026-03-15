process.env.POST_SERVICE_URL = "http://post-service:3006";
process.env.RELATIONSHIP_SERVICE_URL = "http://follow-service:3004";
process.env.PROFILE_SERVICE_URL = "http://profile:3010";

beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  console.error.mockRestore();
});

jest.mock("node-fetch", () => jest.fn());
jest.mock("../../../models/InteractionModel", () => ({
  likeExists: jest.fn(),
  addLike: jest.fn(),
  removeLike: jest.fn(),
  getLikesByPostId: jest.fn(),
  addComment: jest.fn(),
  getCommentById: jest.fn(),
  updateComment: jest.fn(),
  deleteComment: jest.fn(),
  getCommentsByPostId: jest.fn(),
  deleteInteractionsByPostId: jest.fn(),
}));

const fetch = require("node-fetch");
const InteractionModel = require("../../../models/InteractionModel");
const InteractionController = require("../../../controllers/InteractionController");

function mockReq({
  params = {},
  body = {},
  headers = {},
  query = {},
} = {}) {
  return { params, body, headers, query };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("InteractionController - unit tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("likePost", () => {
    test("400 ako postId nije validan", async () => {
      const req = mockReq({
        params: { id: "abc" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.likePost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("404 ako objava ne postoji", async () => {
      fetch.mockResolvedValueOnce({
        status: 404,
        ok: false,
      });

      const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.likePost(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("201 uspesan like kada je korisnik vlasnik objave", async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 5, userId: 1 }),
      });

      InteractionModel.likeExists.mockResolvedValue(false);
      InteractionModel.addLike.mockResolvedValue({});

      const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.likePost(req, res);

      expect(InteractionModel.addLike).toHaveBeenCalledWith(1, 5);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test("403 ako korisnik nema dozvolu", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: 5, userId: 2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ blocked: true }),
        });

      const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.likePost(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("unlikePost", () => {
    test("401 ako nema tokena", async () => {
      const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1" },
      });
      const res = mockRes();

      await InteractionController.unlikePost(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("uspesno uklanja lajk", async () => {
      InteractionModel.removeLike.mockResolvedValue(true);

      const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.unlikePost(req, res);

      expect(InteractionModel.removeLike).toHaveBeenCalledWith(1, 5);
      expect(res.json).toHaveBeenCalledWith({ message: "Lajk je uklonjen" });
    });
  });

  describe("getLikesCount", () => {
    test("403 ako viewer nema pristup", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: 5, userId: 2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ blocked: true }),
        });

      const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.getLikesCount(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test("vraca broj lajkova", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: 5, userId: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ blocked: false }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ blocked: true }),
        });

      InteractionModel.getLikesByPostId.mockResolvedValue([
        { user_id: 2, post_id: 5 },
        { user_id: 3, post_id: 5 },
      ]);

      const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.getLikesCount(req, res);

      expect(res.json).toHaveBeenCalledWith({ count: 1 });
    });
  });

  describe("addComment", () => {
    test("400 ako je komentar prazan", async () => {
      const req = mockReq({
        params: { id: "5" },
        body: { content: "   " },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.addComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("403 ako korisnik nema dozvolu", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: 5, userId: 2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ blocked: true }),
        });

      const req = mockReq({
        params: { id: "5" },
        body: { content: "tekst" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.addComment(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test("201 uspesno dodaje komentar", async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 5, userId: 1 }),
      });

      InteractionModel.addComment.mockResolvedValue(123);

      const req = mockReq({
        params: { id: "5" },
        body: { content: "Novi komentar" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.addComment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        id: 123,
        message: "Komentar je dodat",
      });
    });
  });

  describe("updateComment", () => {
    test("404 ako komentar ne postoji", async () => {
      InteractionModel.getCommentById.mockResolvedValue(null);

      const req = mockReq({
        params: { commentId: "10" },
        body: { content: "izmena" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.updateComment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("403 ako korisnik nije autor", async () => {
      InteractionModel.getCommentById.mockResolvedValue({
        id: 10,
        user_id: 2,
        post_id: 5,
      });

      const req = mockReq({
        params: { commentId: "10" },
        body: { content: "izmena" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.updateComment(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test("uspesno menja komentar", async () => {
      InteractionModel.getCommentById
        .mockResolvedValueOnce({
          id: 10,
          user_id: 1,
          post_id: 5,
          content: "staro",
          created_at: "2025-01-01",
          updated_at: "2025-01-01",
        })
        .mockResolvedValueOnce({
          id: 10,
          user_id: 1,
          post_id: 5,
          content: "novo",
          created_at: "2025-01-01",
          updated_at: "2025-01-02",
        });

      InteractionModel.updateComment.mockResolvedValue(true);

      const req = mockReq({
        params: { commentId: "10" },
        body: { content: "novo" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.updateComment(req, res);

      expect(res.json).toHaveBeenCalledWith({
        id: 10,
        userId: 1,
        postId: 5,
        content: "novo",
        createdAt: "2025-01-01",
        updatedAt: "2025-01-02",
      });
    });
  });

  describe("deleteComment", () => {
    test("404 ako komentar ne postoji", async () => {
      InteractionModel.getCommentById.mockResolvedValue(null);

      const req = mockReq({
        params: { commentId: "10" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.deleteComment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("403 ako korisnik nije ni autor ni vlasnik objave", async () => {
      InteractionModel.getCommentById.mockResolvedValue({
        id: 10,
        user_id: 2,
        post_id: 5,
      });

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 5, userId: 3 }),
      });

      const req = mockReq({
        params: { commentId: "10" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.deleteComment(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test("uspesno brise komentar", async () => {
      InteractionModel.getCommentById.mockResolvedValue({
        id: 10,
        user_id: 1,
        post_id: 5,
      });

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 5, userId: 3 }),
      });

      InteractionModel.deleteComment.mockResolvedValue(true);

      const req = mockReq({
        params: { commentId: "10" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.deleteComment(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: "Komentar je obrisan",
      });
    });
  });

  describe("getCommentsByPost", () => {
    test("403 ako viewer nema pristup", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: 5, userId: 2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ blocked: true }),
        });

      const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.getCommentsByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test("vraca filtrirane komentare", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: 5, userId: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ blocked: false }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ blocked: true }),
        });

      InteractionModel.getCommentsByPostId.mockResolvedValue([
        {
          id: 1,
          user_id: 2,
          post_id: 5,
          content: "prvi",
          created_at: "2025-01-01",
          updated_at: "2025-01-01",
        },
        {
          id: 2,
          user_id: 3,
          post_id: 5,
          content: "drugi",
          created_at: "2025-01-02",
          updated_at: "2025-01-02",
        },
      ]);

      const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.getCommentsByPost(req, res);

      expect(res.json).toHaveBeenCalledWith([
        {
          id: 1,
          userId: 2,
          postId: 5,
          content: "prvi",
          createdAt: "2025-01-01",
          updatedAt: "2025-01-01",
        },
      ]);
    });
  });

  describe("getCommentsCount", () => {
    test("vraca broj komentara nakon filtriranja", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: 5, userId: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ blocked: false }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ blocked: true }),
        });

      InteractionModel.getCommentsByPostId.mockResolvedValue([
        { id: 1, user_id: 2, post_id: 5 },
        { id: 2, user_id: 3, post_id: 5 },
      ]);

      const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1", authorization: "Bearer token" },
      });
      const res = mockRes();

      await InteractionController.getCommentsCount(req, res);

      expect(res.json).toHaveBeenCalledWith({ count: 1 });
    });
  });

  describe("deleteByPost", () => {
    test("400 ako postId nije validan", async () => {
      const req = mockReq({ params: { postId: "abc" } });
      const res = mockRes();

      await InteractionController.deleteByPost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("uspesno brise interakcije za objavu", async () => {
      InteractionModel.deleteInteractionsByPostId.mockResolvedValue();

      const req = mockReq({ params: { postId: "5" } });
      const res = mockRes();

      await InteractionController.deleteByPost(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: "Interakcije za objavu su obrisane",
      });
    });
  });
  describe("dodatni testovi za coverage", () => {

    test("likePost vraca 401 ako nema tokena", async () => {
        const req = mockReq({
        params: { id: "5" },
        headers: { "x-user-id": "1" }
        });

        const res = mockRes();

        await InteractionController.likePost(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
    });


    test("likePost vraca poruku ako je vec lajkovano", async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ id: 5, userId: 1 })
        });

        InteractionModel.likeExists.mockResolvedValue(true);

        const req = mockReq({
            params: { id: "5" },
            headers: { "x-user-id": "1", authorization: "Bearer token" }
        });

        const res = mockRes();

        await InteractionController.likePost(req, res);

        expect(res.json).toHaveBeenCalledWith({
            message: "Objava je već lajkovana"
        });
    });


    test("getLikesCount vraca 400 ako je postId nevalidan", async () => {
        const req = mockReq({
        params: { id: "abc" },
        headers: { "x-user-id": "1", authorization: "Bearer token" }
        });

        const res = mockRes();

        await InteractionController.getLikesCount(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });


    test("addComment vraca 401 ako nema tokena", async () => {
        const req = mockReq({
        params: { id: "5" },
        body: { content: "tekst" },
        headers: { "x-user-id": "1" }
        });

        const res = mockRes();

        await InteractionController.addComment(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
    });


    test("updateComment vraca 400 ako je content prazan", async () => {
        const req = mockReq({
        params: { commentId: "5" },
        body: { content: "" },
        headers: { "x-user-id": "1", authorization: "Bearer token" }
        });

        const res = mockRes();

        await InteractionController.updateComment(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });


    test("deleteByPost vraca 500 ako model pukne", async () => {
        InteractionModel.deleteInteractionsByPostId.mockRejectedValue(new Error("db error"));

        const req = mockReq({ params: { postId: "5" } });
        const res = mockRes();

        await InteractionController.deleteByPost(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });

    });

});