/**
 * API Integracioni testovi – Interactions Service (kroz API Gateway)
 *
 * Pre pokretanja mora biti pokrenut ceo Docker:
 *   docker compose up -d
 *
 * Pokretanje (iz integration-tests foldera):
 *   npm test -- tests/interactions.test.js
 */

const request = require('supertest');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

// ─── KONEKCIJA NA BAZE ────────────────────────────────────────────────────────

let authDb;
let postDb;
let interactionsDb;
let followDb;

beforeAll(async () => {
  authDb = await mysql.createConnection({
    host: '127.0.0.1',
    port: 5000,
    user: 'auth_db_user',
    password: 'auth_db_password',
    database: 'auth_db',
  });

  postDb = await mysql.createConnection({
    host: '127.0.0.1',
    port: 5003,
    user: 'post_service_db_user',
    password: 'post_service_db_password',
    database: 'post_service_db',
  });

  interactionsDb = await mysql.createConnection({
    host: '127.0.0.1',
    port: 5005,
    user: 'interactions_service_db_user',
    password: 'interactions_service_db_password',
    database: 'interactions_service_db',
  });

  followDb = await mysql.createConnection({
    host: '127.0.0.1',
    port: 5001,
    user: 'follow_service_db_user',
    password: 'follow_service_db_password',
    database: 'follow_service',
  });
});

afterAll(async () => {
  await authDb.end();
  await postDb.end();
  await interactionsDb.end();
  await followDb.end();
});

// ─── HELPER FUNKCIJE ──────────────────────────────────────────────────────────

const insertAuthUser = async ({ firstName = 'Test', lastName = 'Korisnik', username, email, password, isPrivate = 0 }) => {
  const hash = await bcrypt.hash(password, 10);
  const [result] = await authDb.execute(
    `INSERT INTO users (first_name, last_name, username, email, password_hash, is_private) VALUES (?, ?, ?, ?, ?, ?)`,
    [firstName, lastName, username, email, hash, isPrivate]
  );
  return result.insertId;
};

const loginUser = async (identifier, password) => {
  const res = await request(GATEWAY_URL)
    .post('/api/authentication/login')
    .send({ identifier, password });
  return res.body.accessToken;
};

const cleanupAuthUsers = async (...emails) => {
  for (const email of emails) {
    await authDb.execute('DELETE FROM users WHERE email = ?', [email]);
  }
};

const cleanupPosts = async (userId) => {
  await postDb.execute('DELETE FROM posts WHERE user_id = ?', [userId]);
};

const cleanupLikes = async (userId, postId) => {
  await interactionsDb.execute('DELETE FROM likes WHERE user_id = ? AND post_id = ?', [userId, postId]);
};

const cleanupComments = async (postId) => {
  await interactionsDb.execute('DELETE FROM comments WHERE post_id = ?', [postId]);
};

const cleanupFollows = async (followerId, followingId) => {
  await followDb.execute('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
};

const cleanupBlocks = async (blockerId, blockedId) => {
  await followDb.execute('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [blockerId, blockedId]);
};

// Minimalna validna PNG slika
const minimalPng = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
  'hex'
);

const createTestPost = async (token) => {
  const res = await request(GATEWAY_URL)
    .post('/api/posts')
    .set('Authorization', `Bearer ${token}`)
    .attach('files', minimalPng, { filename: 'test.png', contentType: 'image/png' });
  return res.body.id;
};

// ─── TEST PODACI ──────────────────────────────────────────────────────────────

const USER_A         = { username: 'inter_test_a',      email: 'inter_test_a@test.com',      password: 'TestLozinka123!', isPrivate: 0 };
const USER_B_PUBLIC  = { username: 'inter_test_b_pub',  email: 'inter_test_b_pub@test.com',  password: 'TestLozinka123!', isPrivate: 0 };
const USER_B_PRIVATE = { username: 'inter_test_b_priv', email: 'inter_test_b_priv@test.com', password: 'TestLozinka123!', isPrivate: 1 };

// =============================================================================
// 1. LAJKOVANJE
// =============================================================================
describe('Lajkovanje objava', () => {
  let userAId, userBId, tokenA, tokenB, postId;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PUBLIC);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
    tokenB  = await loginUser(USER_B_PUBLIC.email, USER_B_PUBLIC.password);

    postId = await createTestPost(tokenB);
  });

  afterAll(async () => {
    await cleanupLikes(userAId, postId);
    await cleanupPosts(userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email);
  });

  test('Uspešno lajkovanje objave javnog profila', async () => {
    const res = await request(GATEWAY_URL)
      .post(`/api/interactions/posts/${postId}/likes`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Objava je uspešno lajkovana');
  });

  test('Dvostruko lajkovanje vraća poruku da je već lajkovano', async () => {
    const res = await request(GATEWAY_URL)
      .post(`/api/interactions/posts/${postId}/likes`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Objava je već lajkovana');
  });

  test('Dohvat broja lajkova', async () => {
    const res = await request(GATEWAY_URL)
      .get(`/api/interactions/posts/${postId}/likes/count`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  test('Provera status lajka — lajkovano', async () => {
    const res = await request(GATEWAY_URL)
      .get(`/api/interactions/posts/${postId}/likes/status`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.isLiked).toBe(true);
  });

  test('Uklanjanje lajka', async () => {
    const res = await request(GATEWAY_URL)
      .delete(`/api/interactions/posts/${postId}/likes`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Lajk je uklonjen');
  });

  test('Provera status lajka — nije lajkovano', async () => {
    const res = await request(GATEWAY_URL)
      .get(`/api/interactions/posts/${postId}/likes/status`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.isLiked).toBe(false);
  });

  test('Lajkovanje bez autentifikacije vraća 401', async () => {
    const res = await request(GATEWAY_URL)
      .post(`/api/interactions/posts/${postId}/likes`);

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// 2. LAJKOVANJE PRIVATNOG PROFILA
// =============================================================================
describe('Lajkovanje objava privatnog profila', () => {
  let userAId, userBId, tokenA, tokenB, postId;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PRIVATE);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
    tokenB  = await loginUser(USER_B_PRIVATE.email, USER_B_PRIVATE.password);

    postId = await createTestPost(tokenB);
  });

  afterAll(async () => {
    await cleanupLikes(userAId, postId);
    await cleanupFollows(userAId, userBId);
    await cleanupPosts(userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PRIVATE.email);
  });

  test('Ne može se lajkovati objava privatnog profila bez praćenja', async () => {
    const res = await request(GATEWAY_URL)
      .post(`/api/interactions/posts/${postId}/likes`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
  });

  test('Može se lajkovati objava privatnog profila koji se prati', async () => {
    // A šalje zahtev za praćenje B privatnog
    await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });

    // B prihvata zahtev
    await request(GATEWAY_URL)
      .put('/api/follow/accept')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ follower_id: userAId });

    const res = await request(GATEWAY_URL)
      .post(`/api/interactions/posts/${postId}/likes`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(201);
  });
});

// =============================================================================
// 3. KOMENTARISANJE
// =============================================================================
describe('Komentarisanje objava', () => {
  let userAId, userBId, tokenA, tokenB, postId, commentId;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PUBLIC);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
    tokenB  = await loginUser(USER_B_PUBLIC.email, USER_B_PUBLIC.password);

    postId = await createTestPost(tokenB);
  });

  afterAll(async () => {
    await cleanupComments(postId);
    await cleanupPosts(userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email);
  });

  test('Uspešno dodavanje komentara', async () => {
    const res = await request(GATEWAY_URL)
      .post(`/api/interactions/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'Odličan post!' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.message).toBe('Komentar je dodat');
    commentId = res.body.id;
  });

  test('Dohvat komentara objave', async () => {
    const res = await request(GATEWAY_URL)
      .get(`/api/interactions/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('Dohvat broja komentara', async () => {
    const res = await request(GATEWAY_URL)
      .get(`/api/interactions/posts/${postId}/comments/count`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  test('Dodavanje komentara bez sadržaja vraća 400', async () => {
    const res = await request(GATEWAY_URL)
      .post(`/api/interactions/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: '' });

    expect(res.status).toBe(400);
  });

  test('Uspešna izmena komentara', async () => {
    const res = await request(GATEWAY_URL)
      .put(`/api/interactions/comments/${commentId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'Izmenjen komentar' });

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Izmenjen komentar');
  });

  test('Drugi korisnik ne može menjati tuđi komentar', async () => {
    const res = await request(GATEWAY_URL)
      .put(`/api/interactions/comments/${commentId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ content: 'Pokusaj izmene' });

    expect(res.status).toBe(403);
  });

  test('Uspešno brisanje komentara', async () => {
    const res = await request(GATEWAY_URL)
      .delete(`/api/interactions/comments/${commentId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Komentar je obrisan');
  });

  test('Komentarisanje bez autentifikacije vraća 401', async () => {
    const res = await request(GATEWAY_URL)
      .post(`/api/interactions/posts/${postId}/comments`)
      .send({ content: 'Test' });

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// 4. BLOKIRANJE I INTERAKCIJE
// =============================================================================
describe('Blokiranje i interakcije', () => {
  let userAId, userBId, tokenA, tokenB, postId;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PUBLIC);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
    tokenB  = await loginUser(USER_B_PUBLIC.email, USER_B_PUBLIC.password);

    postId = await createTestPost(tokenB);

    // A blokira B
    await request(GATEWAY_URL)
      .post('/api/block')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ blocked_id: userBId });
  });

  afterAll(async () => {
    await cleanupBlocks(userAId, userBId);
    await cleanupPosts(userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email);
  });

  test('Blokirani korisnik ne može lajkovati objavu', async () => {
    const res = await request(GATEWAY_URL)
      .post(`/api/interactions/posts/${postId}/likes`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
  });

  test('Blokirani korisnik ne može komentarisati objavu', async () => {
    const res = await request(GATEWAY_URL)
      .post(`/api/interactions/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'Test komentar' });

    expect(res.status).toBe(403);
  });
});