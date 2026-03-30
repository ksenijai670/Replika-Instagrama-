/**
 * API Integracioni testovi – Profile Service (kroz API Gateway)
 *
 * Pre pokretanja mora biti pokrenut ceo Docker:
 *   docker compose up -d
 *
 * Pokretanje (iz integration-tests foldera):
 *   npm test -- tests/profile.test.js
 */

const request = require('supertest');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

// ─── KONEKCIJA NA BAZU ────────────────────────────────────────────────────────

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
  await authDb.execute('DELETE FROM users WHERE email = ?', [email]);
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

const cleanupBlocks = async (blockerId, blockedId) => {
  await followDb.execute(
    'DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?',
    [blockerId, blockedId]
  );
};

// ─── TEST PODACI ──────────────────────────────────────────────────────────────

const USER_A         = { username: 'profile_test_a',      email: 'profile_test_a@test.com',      password: 'TestLozinka123!', isPrivate: 0 };
const USER_B_PUBLIC  = { username: 'profile_test_b_pub',  email: 'profile_test_b_pub@test.com',  password: 'TestLozinka123!', isPrivate: 0 };
const USER_B_PRIVATE = { username: 'profile_test_b_priv', email: 'profile_test_b_priv@test.com', password: 'TestLozinka123!', isPrivate: 1 };

// =============================================================================
// 1. PRETRAGA KORISNIKA
// =============================================================================
describe('GET /api/profile/search', () => {
  let userAId, tokenA;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    await insertAuthUser(USER_B_PUBLIC);
    tokenA = await loginUser(USER_A.email, USER_A.password);
  });

  afterAll(async () => {
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email);
  });

  test('Pretraga po korisničkom imenu vraća rezultate', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/profile/search?q=profile_test_b')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThan(0);
    expect(res.body.users[0].username).toBe(USER_B_PUBLIC.username);
  });

  test('Pretraga po imenu vraća rezultate', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/profile/search?q=Test')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThan(0);
  });

  test('Pretraga bez query parametra vraća 400', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/profile/search')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
  });

  test('Pretraga sa jednim karakterom vraća 400', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/profile/search?q=a')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
  });

  test('Pretraga bez autentifikacije vraća 401', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/profile/search?q=test');

    expect(res.status).toBe(401);
  });

  test('Blokirani korisnik se ne pojavljuje u pretrazi', async () => {
    // A blokira B
    await request(GATEWAY_URL)
      .post('/api/block')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ blocked_id: (await authDb.execute('SELECT id FROM users WHERE email = ?', [USER_B_PUBLIC.email]))[0][0].id });

    const res = await request(GATEWAY_URL)
      .get(`/api/profile/search?q=${USER_B_PUBLIC.username}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const usernames = res.body.users.map(u => u.username);
    expect(usernames).not.toContain(USER_B_PUBLIC.username);

    // Cleanup bloka
    const [rows] = await authDb.execute('SELECT id FROM users WHERE email = ?', [USER_B_PUBLIC.email]);
    await cleanupBlocks(userAId, rows[0].id);
  });
});

// =============================================================================
// 2. DOHVAT PROFILA KORISNIKA
// =============================================================================
describe('GET /api/profile/users/:userId', () => {
  let userAId, userBPublicId, userBPrivateId, tokenA, tokenB;

  beforeAll(async () => {
    userAId        = await insertAuthUser(USER_A);
    userBPublicId  = await insertAuthUser(USER_B_PUBLIC);
    userBPrivateId = await insertAuthUser(USER_B_PRIVATE);
    tokenA         = await loginUser(USER_A.email, USER_A.password);
    tokenB         = await loginUser(USER_B_PRIVATE.email, USER_B_PRIVATE.password);
  });

  afterAll(async () => {
    await cleanupFollows(userAId, userBPrivateId);
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email, USER_B_PRIVATE.email);
  });

  test('Dohvat javnog profila vraća osnovne podatke', async () => {
    const res = await request(GATEWAY_URL)
      .get(`/api/profile/users/${userBPublicId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      username: USER_B_PUBLIC.username,
      is_private: false,
    });
  });

  test('Javni profil sadrži broj pratilaca i praćenih', async () => {
    const res = await request(GATEWAY_URL)
      .get(`/api/profile/users/${userBPublicId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('followers_count');
    expect(res.body.user).toHaveProperty('following_count');
  });

  test('Dohvat privatnog profila vraća podatke', async () => {
    const res = await request(GATEWAY_URL)
      .get(`/api/profile/users/${userBPrivateId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      username: USER_B_PRIVATE.username,
      is_private: true,
    });
  });

  test('Pratilac može videti objave privatnog profila', async () => {
    // A prati B privatnog
    await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBPrivateId });

    // B prihvata zahtev
    await request(GATEWAY_URL)
      .put('/api/follow/accept')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ follower_id: userAId });

    const res = await request(GATEWAY_URL)
      .get(`/api/profile/users/${userBPrivateId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('posts');
  });

  test('Dohvat nepostojećeg profila vraća 404', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/profile/users/99999999')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  test('Dohvat profila bez autentifikacije vraća 401', async () => {
    const res = await request(GATEWAY_URL)
      .get(`/api/profile/users/${userBPublicId}`);

    expect(res.status).toBe(401);
  });

  test('Blokirani korisnik ne može videti profil', async () => {
    // A blokira B javnog
    await request(GATEWAY_URL)
      .post('/api/block')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ blocked_id: userBPublicId });

    const res = await request(GATEWAY_URL)
      .get(`/api/profile/users/${userBPublicId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);

    // Cleanup
    await cleanupBlocks(userAId, userBPublicId);
  });
});

// =============================================================================
// 3. LISTA PRATILACA I PRAĆENIH
// =============================================================================
describe('Lista pratilaca i praćenih', () => {
  let userAId, userBId, tokenA, tokenB;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PUBLIC);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
    tokenB  = await loginUser(USER_B_PUBLIC.email, USER_B_PUBLIC.password);

    // A prati B
    await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });
  });

  afterAll(async () => {
    await cleanupFollows(userAId, userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email);
  });

  test('Lista pratilaca B sadrži A', async () => {
    const res = await request(GATEWAY_URL)
      .get(`/api/profile/users/${userBId}/followers`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.followers).toBeDefined();
    const ids = res.body.followers.map(u => u.id);
    expect(ids).toContain(userAId);
  });

  test('Lista praćenih A sadrži B', async () => {
    const res = await request(GATEWAY_URL)
      .get(`/api/profile/users/${userAId}/following`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.following).toBeDefined();
    const ids = res.body.following.map(u => u.id);
    expect(ids).toContain(userBId);
  });

  test('Lista pratilaca bez autentifikacije vraća 401', async () => {
    const res = await request(GATEWAY_URL)
      .get(`/api/profile/users/${userBId}/followers`);

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// 4. AŽURIRANJE PROFILA
// =============================================================================
describe('PUT /api/profile/users/me', () => {
  let userAId, tokenA;

  beforeEach(async () => {
    userAId = await insertAuthUser(USER_A);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
  });

  afterEach(async () => {
    await cleanupAuthUsers(USER_A.email);
  });

  test('Uspešno ažuriranje bio polja', async () => {
    const res = await request(GATEWAY_URL)
      .put('/api/profile/users/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        first_name: 'Test',
        last_name: 'Korisnik',
        bio: 'Novi bio tekst',
        profile_image_url: null,
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Profil uspesno azuriran');

    const [rows] = await authDb.execute('SELECT bio FROM users WHERE id = ?', [userAId]);
    expect(rows[0].bio).toBe('Novi bio tekst');
  });

  test('Uspešno ažuriranje imena i prezimena', async () => {
    const res = await request(GATEWAY_URL)
      .put('/api/profile/users/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        first_name: 'Novo',
        last_name: 'Ime',
        bio: null,
        profile_image_url: null,
      });

    expect(res.status).toBe(200);

    const [rows] = await authDb.execute('SELECT first_name, last_name FROM users WHERE id = ?', [userAId]);
    expect(rows[0].first_name).toBe('Novo');
    expect(rows[0].last_name).toBe('Ime');
  });

  test('Ažuriranje profila bez autentifikacije vraća 401', async () => {
    const res = await request(GATEWAY_URL)
      .put('/api/profile/users/me')
      .send({ first_name: 'Test', last_name: 'Korisnik', bio: null, profile_image_url: null });

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// 5. UPLOAD AVATARA
// =============================================================================
describe('POST /api/profile/avatar', () => {
  let userAId, tokenA;

  // Minimalna validna PNG slika (1x1 piksel)
  const minimalPng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
    'hex'
  );

  beforeEach(async () => {
    userAId = await insertAuthUser(USER_A);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
  });

  afterEach(async () => {
    await cleanupAuthUsers(USER_A.email);
  });

  test('Uspešan upload avatara', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/profile/avatar')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('avatar', minimalPng, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('url');
    expect(res.body.message).toBe('Uspesno');

    // Proveravamo da je URL sačuvan u bazi
    const [rows] = await authDb.execute(
      'SELECT profile_image_url FROM users WHERE id = ?',
      [userAId]
    );
    expect(rows[0].profile_image_url).toBeTruthy();
  });

  test('Upload avatara bez fajla vraća 400', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/profile/avatar')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Nema fajla');
  });

  test('Upload avatara bez autentifikacije vraća 401', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/profile/avatar')
      .attach('avatar', minimalPng, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(401);
  });
});