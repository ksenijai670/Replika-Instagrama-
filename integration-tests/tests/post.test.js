/**
 * API Integracioni testovi – Post Service (kroz API Gateway)
 *
 * Pre pokretanja mora biti pokrenut ceo Docker:
 *   docker compose up -d
 *
 * Pokretanje (iz integration-tests foldera):
 *   npm test -- tests/post.test.js
 */

const request = require('supertest');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

// ─── KONEKCIJA NA BAZE ────────────────────────────────────────────────────────

let authDb;
let postDb;

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
});

afterAll(async () => {
  await authDb.end();
  await postDb.end();
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

// Minimalna validna PNG slika (1x1 piksel)
const minimalPng = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
  'hex'
);

// ─── TEST PODACI ──────────────────────────────────────────────────────────────

const USER_A = { username: 'post_test_a', email: 'post_test_a@test.com', password: 'TestLozinka123!' };
const USER_B = { username: 'post_test_b', email: 'post_test_b@test.com', password: 'TestLozinka123!' };

// =============================================================================
// 1. KREIRANJE OBJAVE
// =============================================================================
describe('POST /api/posts', () => {
  let userAId, tokenA;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
  });

  afterAll(async () => {
    await cleanupPosts(userAId);
    await cleanupAuthUsers(USER_A.email);
  });

  test('Uspešno kreiranje objave sa slikom', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/posts')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('files', minimalPng, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('media');
    expect(res.body.media.length).toBe(1);
  });

  test('Uspešno kreiranje objave sa opisom', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/posts')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('caption', 'Ovo je opis objave')
      .attach('files', minimalPng, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.caption).toBe('Ovo je opis objave');
  });

  test('Kreiranje objave bez fajlova vraća 400', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/posts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Potreban bar 1 fajl');
  });

  test('Kreiranje objave sa više od 20 fajlova vraća 400', async () => {
    const req = request(GATEWAY_URL)
      .post('/api/posts')
      .set('Authorization', `Bearer ${tokenA}`);

    for (let i = 0; i < 21; i++) {
      req.attach('files', minimalPng, { filename: `test${i}.png`, contentType: 'image/png' });
    }

    const res = await req;
    expect(res.status).toBe(400);
  });

  test('Kreiranje objave bez autentifikacije vraća 401', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/posts')
      .attach('files', minimalPng, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// 2. DOHVAT OBJAVE
// =============================================================================
describe('GET /api/posts/:id', () => {
  let userAId, tokenA, postId;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    tokenA  = await loginUser(USER_A.email, USER_A.password);

    const res = await request(GATEWAY_URL)
      .post('/api/posts')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('caption', 'Test objava')
      .attach('files', minimalPng, { filename: 'test.png', contentType: 'image/png' });

    postId = res.body.id;
  });

  afterAll(async () => {
    await cleanupPosts(userAId);
    await cleanupAuthUsers(USER_A.email);
  });

  test('Uspešan dohvat objave', async () => {
    const res = await request(GATEWAY_URL)
      .get(`/api/posts/${postId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(postId);
    expect(res.body.caption).toBe('Test objava');
    expect(res.body).toHaveProperty('media');
  });

  test('Dohvat nepostojeće objave vraća 404', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/posts/99999999')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// 3. AŽURIRANJE OPISA OBJAVE
// =============================================================================
describe('PUT /api/posts/:id/caption', () => {
  let userAId, userBId, tokenA, tokenB, postId;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
    tokenB  = await loginUser(USER_B.email, USER_B.password);

    const res = await request(GATEWAY_URL)
      .post('/api/posts')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('files', minimalPng, { filename: 'test.png', contentType: 'image/png' });

    postId = res.body.id;
  });

  afterAll(async () => {
    await cleanupPosts(userAId);
    await cleanupAuthUsers(USER_A.email, USER_B.email);
  });

  test('Uspešno ažuriranje opisa objave', async () => {
    const res = await request(GATEWAY_URL)
      .put(`/api/posts/${postId}/caption`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ caption: 'Izmenjen opis' });

    expect(res.status).toBe(200);
    expect(res.body.caption).toBe('Izmenjen opis');
  });

  test('Drugi korisnik ne može menjati opis', async () => {
    const res = await request(GATEWAY_URL)
      .put(`/api/posts/${postId}/caption`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ caption: 'Pokusaj izmene' });

    expect(res.status).toBe(403);
  });

  test('Ažuriranje opisa nepostojeće objave vraća 404', async () => {
    const res = await request(GATEWAY_URL)
      .put('/api/posts/99999999/caption')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ caption: 'Test' });

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// 4. BRISANJE MEDIJA IZ OBJAVE
// =============================================================================
describe('DELETE /api/posts/:id/media/:mediaId', () => {
  let userAId, tokenA, postId, mediaId;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    tokenA  = await loginUser(USER_A.email, USER_A.password);

    const res = await request(GATEWAY_URL)
      .post('/api/posts')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('files', minimalPng, { filename: 'test1.png', contentType: 'image/png' })
      .attach('files', minimalPng, { filename: 'test2.png', contentType: 'image/png' });

    postId  = res.body.id;
    mediaId = res.body.media[0].id;
  });

  afterAll(async () => {
    await cleanupPosts(userAId);
    await cleanupAuthUsers(USER_A.email);
  });

  test('Uspešno brisanje medija iz objave', async () => {
    const res = await request(GATEWAY_URL)
      .delete(`/api/posts/${postId}/media/${mediaId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Uspešno brisanje medije');
  });

  test('Brisanje nepostojećeg medija vraća 404', async () => {
    const res = await request(GATEWAY_URL)
      .delete(`/api/posts/${postId}/media/99999999`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// 5. BRISANJE OBJAVE
// =============================================================================
describe('DELETE /api/posts/:id', () => {
  let userAId, userBId, tokenA, tokenB, postId;

  beforeEach(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
    tokenB  = await loginUser(USER_B.email, USER_B.password);

    const res = await request(GATEWAY_URL)
      .post('/api/posts')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('files', minimalPng, { filename: 'test.png', contentType: 'image/png' });

    postId = res.body.id;
  });

  afterEach(async () => {
    await cleanupPosts(userAId);
    await cleanupPosts(userBId);
    await cleanupAuthUsers(USER_A.email, USER_B.email);
  });

  test('Uspešno brisanje objave', async () => {
    const res = await request(GATEWAY_URL)
      .delete(`/api/posts/${postId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Uspešno brisanje objave');

    const [rows] = await postDb.execute('SELECT * FROM posts WHERE id = ?', [postId]);
    expect(rows.length).toBe(0);
  });

  test('Drugi korisnik ne može brisati objavu', async () => {
    const res = await request(GATEWAY_URL)
      .delete(`/api/posts/${postId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
  });

  test('Brisanje nepostojeće objave vraća 404', async () => {
    const res = await request(GATEWAY_URL)
      .delete('/api/posts/99999999')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  test('Brisanje objave bez autentifikacije vraća 401', async () => {
    const res = await request(GATEWAY_URL)
      .delete(`/api/posts/${postId}`);

    expect(res.status).toBe(401);
  });
});