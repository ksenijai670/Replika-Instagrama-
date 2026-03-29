/**
 * API Integracioni testovi – Feed Service (kroz API Gateway)
 *
 * Pre pokretanja mora biti pokrenut ceo Docker:
 *   docker compose up -d
 *
 * Pokretanje (iz integration-tests foldera):
 *   npm test -- tests/feed.test.js
 */

const request = require('supertest');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

// ─── KONEKCIJA NA BAZE ────────────────────────────────────────────────────────

let authDb;
let followDb;

beforeAll(async () => {
  authDb = await mysql.createConnection({
    host: '127.0.0.1',
    port: 5000,
    user: 'auth_db_user',
    password: 'auth_db_password',
    database: 'auth_db',
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

const cleanupFollows = async (followerId, followingId) => {
  await followDb.execute(
    'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
    [followerId, followingId]
  );
};

const minimalPng = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
  'hex'
);

const createTestPost = async (token, caption = 'Test objava') => {
  const res = await request(GATEWAY_URL)
    .post('/api/posts')
    .set('Authorization', `Bearer ${token}`)
    .field('caption', caption)
    .attach('files', minimalPng, { filename: 'test.png', contentType: 'image/png' });
  return res.body.id;
};

// ─── TEST PODACI ──────────────────────────────────────────────────────────────

const USER_A = { username: 'feed_test_a', email: 'feed_test_a@test.com', password: 'TestLozinka123!' };
const USER_B = { username: 'feed_test_b', email: 'feed_test_b@test.com', password: 'TestLozinka123!', isPrivate: 0 };

// =============================================================================
// 1. OSNOVNI FEED
// =============================================================================
describe('GET /api/feed', () => {
  let userAId, tokenA;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
  });

  afterAll(async () => {
    await cleanupAuthUsers(USER_A.email);
  });

  test('Feed vraća 200 sa validnim tokenom', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/feed')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('posts');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('has_more');
    expect(Array.isArray(res.body.posts)).toBe(true);
  });

  test('Korisnik koji ne prati nikoga ima prazan feed', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/feed')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.length).toBe(0);
    expect(res.body.total).toBe(0);
  });

  test('Feed bez autentifikacije vraća 401', async () => {
    const res = await request(GATEWAY_URL).get('/api/feed');

    expect(res.status).toBe(401);
  });

  test('Feed podržava limit parametar', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/feed?limit=5')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(5);
  });

  test('Feed podržava offset parametar', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/feed?offset=0')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.offset).toBe(0);
  });
});

// =============================================================================
// 2. FEED SA OBJAVAМА PRAĆENIH
// =============================================================================
describe('Feed sa objavama praćenih korisnika', () => {
  let userAId, userBId, tokenA, tokenB, postId;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
    tokenB  = await loginUser(USER_B.email, USER_B.password);

    // A prati B
    await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });

    // B objavljuje post
    postId = await createTestPost(tokenB, 'Objava za feed');
  });

  afterAll(async () => {
    await cleanupFollows(userAId, userBId);
    await cleanupAuthUsers(USER_A.email, USER_B.email);
  });

  test('Feed sadrži objave korisnika koje A prati', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/feed')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.length).toBeGreaterThan(0);

    const postIds = res.body.posts.map(p => p.id);
    expect(postIds).toContain(postId);
  });

  test('Feed je hronološki sortiran — najnovije prve', async () => {
    // B objavljuje još jedan post
    await createTestPost(tokenB, 'Novija objava');

    const res = await request(GATEWAY_URL)
      .get('/api/feed')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.length).toBeGreaterThanOrEqual(2);

    const dates = res.body.posts.map(p => new Date(p.createdAt).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }
  });

  test('Feed ne sadrži objave korisnika koje A ne prati', async () => {
    // Kreiramo trećeg korisnika kojeg A ne prati
    const userCId = await insertAuthUser({
      username: 'feed_test_c',
      email: 'feed_test_c@test.com',
      password: 'TestLozinka123!'
    });
    const tokenC = await loginUser('feed_test_c@test.com', 'TestLozinka123!');
    const postCId = await createTestPost(tokenC, 'Objava C korisnika');

    const res = await request(GATEWAY_URL)
      .get('/api/feed')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const postIds = res.body.posts.map(p => p.id);
    expect(postIds).not.toContain(postCId);

    await cleanupAuthUsers('feed_test_c@test.com');
  });
});

// =============================================================================
// 3. PAGINACIJA
// =============================================================================
describe('Paginacija feeda', () => {
  let userAId, userBId, tokenA, tokenB;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
    tokenB  = await loginUser(USER_B.email, USER_B.password);

    // A prati B
    await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });

    // B kreira 3 objave
    for (let i = 0; i < 3; i++) {
      await createTestPost(tokenB, `Objava ${i + 1}`);
    }
  });

  afterAll(async () => {
    await cleanupFollows(userAId, userBId);
    await cleanupAuthUsers(USER_A.email, USER_B.email);
  });

  test('Paginacija — limit 2 vraća 2 objave', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/feed?limit=2&offset=0')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.length).toBe(2);
    expect(res.body.has_more).toBe(true);
    expect(res.body.next_offset).toBe(2);
  });

  test('Paginacija — offset 2 vraća ostatak', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/feed?limit=2&offset=2')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.length).toBeGreaterThanOrEqual(1);
  });
});