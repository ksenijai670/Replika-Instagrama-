/**
 * API Integracioni testovi – Authentication Service (kroz API Gateway)
 *
 * Pristup: testiranje kroz API Gateway na portu 4000
 *
 * Pre pokretanja mora biti pokrenut ceo Docker:
 *   docker compose up -d
 *
 * Pokretanje (iz integration-tests foldera):
 *   npm test -- tests/auth.test.js
 */

const request = require('supertest');
const mysql = require('mysql2/promise');
const { createClient } = require('redis');

const BASE_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

// ─── KONEKCIJA NA BAZU I REDIS (za proveru i cleanup) ────────────────────────

let db;
let redis;

beforeAll(async () => {
  db = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 5000,
    user: process.env.DB_USER || 'auth_db_user',
    password: process.env.DB_PASSWORD || 'auth_db_password',
    database: process.env.AUTH_DB_NAME || 'auth_db',
  });

  redis = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:5100' });
  await redis.connect();
});

afterAll(async () => {
  await db.end();
  await redis.quit();
});

// ─── HELPER FUNKCIJE ──────────────────────────────────────────────────────────

const cleanupUsers = async (...emails) => {
  for (const email of emails) {
    await db.execute('DELETE FROM users WHERE email = ?', [email]);
  }
};

const cleanupRefreshTokens = async (userId) => {
  await db.execute('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
};

const bcrypt = require('bcrypt');
const insertTestUser = async ({
  firstName = 'Test',
  lastName = 'Korisnik',
  username,
  email,
  password,
  isPrivate = 0,
} = {}) => {
  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await db.execute(
    `INSERT INTO users (first_name, last_name, username, email, password_hash, is_private)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [firstName, lastName, username, email, passwordHash, isPrivate]
  );
  return result.insertId;
};

// ─── TEST PODACI ──────────────────────────────────────────────────────────────

const TEST_EMAIL      = 'integracioni_test@test.com';
const TEST_EMAIL_2    = 'integracioni_test2@test.com';
const TEST_USERNAME   = 'inttest_korisnik';
const TEST_USERNAME_2 = 'inttest_korisnik2';
const TEST_PASSWORD   = 'TestLozinka123!';

// =============================================================================
// 1. REGISTRACIJA
// =============================================================================
describe('POST /api/authentication/register', () => {
  afterEach(async () => {
    await cleanupUsers(TEST_EMAIL, TEST_EMAIL_2);
  });

  test('Uspešna registracija sa svim obaveznim poljima', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/register')
      .send({
        firstName: 'Test',
        lastName: 'Korisnik',
        username: TEST_USERNAME,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('User registered');

    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [TEST_EMAIL]);
    expect(rows.length).toBe(1);
    expect(rows[0].username).toBe(TEST_USERNAME);
  });

  test('Uspešna registracija sa opcionim bio poljem', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/register')
      .send({
        firstName: 'Test',
        lastName: 'Korisnik',
        username: TEST_USERNAME,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        bio: 'Ovo je moj bio',
      });

    expect(res.status).toBe(201);

    const [rows] = await db.execute('SELECT bio FROM users WHERE email = ?', [TEST_EMAIL]);
    expect(rows[0].bio).toBe('Ovo je moj bio');
  });

  test('Lozinka se čuva kao bcrypt hash, ne kao plain text', async () => {
    await request(BASE_URL)
      .post('/api/authentication/register')
      .send({
        firstName: 'Test',
        lastName: 'Korisnik',
        username: TEST_USERNAME,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });

    const [rows] = await db.execute('SELECT password_hash FROM users WHERE email = ?', [TEST_EMAIL]);
    expect(rows[0].password_hash).not.toBe(TEST_PASSWORD);
    expect(rows[0].password_hash).toMatch(/^\$2b\$/);
  });

  test('Registracija bez firstName vraća 400 i ne upisuje korisnika', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/register')
      .send({
        lastName: 'Korisnik',
        username: TEST_USERNAME,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });

    expect(res.status).toBe(400);

    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [TEST_EMAIL]);
    expect(rows.length).toBe(0);
  });

  test('Registracija bez username vraća 400', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/register')
      .send({
        firstName: 'Test',
        lastName: 'Korisnik',
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });

    expect(res.status).toBe(400);
  });

  test('Registracija bez email vraća 400', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/register')
      .send({
        firstName: 'Test',
        lastName: 'Korisnik',
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
      });

    expect(res.status).toBe(400);
  });

  test('Registracija bez lozinke vraća 400', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/register')
      .send({
        firstName: 'Test',
        lastName: 'Korisnik',
        username: TEST_USERNAME,
        email: TEST_EMAIL,
      });

    expect(res.status).toBe(400);
  });

  test('Registracija sa već zauzetim username-om vraća 409', async () => {
    await request(BASE_URL).post('/api/authentication/register').send({
      firstName: 'Test',
      lastName: 'Korisnik',
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    const res = await request(BASE_URL)
      .post('/api/authentication/register')
      .send({
        firstName: 'Test',
        lastName: 'Korisnik',
        username: TEST_USERNAME,
        email: TEST_EMAIL_2,
        password: TEST_PASSWORD,
      });

    expect(res.status).toBe(409);
  });

  test('Registracija sa već zauzetim email-om vraća 409', async () => {
    await request(BASE_URL).post('/api/authentication/register').send({
      firstName: 'Test',
      lastName: 'Korisnik',
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    const res = await request(BASE_URL)
      .post('/api/authentication/register')
      .send({
        firstName: 'Test',
        lastName: 'Korisnik',
        username: TEST_USERNAME_2,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });

    expect(res.status).toBe(409);
  });
});

// =============================================================================
// 2. LOGIN
// =============================================================================
describe('POST /api/authentication/login', () => {
  let userId;

  beforeAll(async () => {
    userId = await insertTestUser({
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
  });

  afterAll(async () => {
    await cleanupRefreshTokens(userId);
    await cleanupUsers(TEST_EMAIL);
  });

  test('Uspešan login sa korisničkim imenom', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/login')
      .send({ identifier: TEST_USERNAME, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  test('Uspešan login sa email adresom', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/login')
      .send({ identifier: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  test('Login sa pogrešnom lozinkom vraća 401', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/login')
      .send({ identifier: TEST_USERNAME, password: 'pogresna_lozinka' });

    expect(res.status).toBe(401);
  });

  test('Login sa nepostojećim korisnikom vraća 401', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/login')
      .send({ identifier: 'nepostojeci_xyz_123', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
  });

  test('Login čuva refresh token u Redis-u', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/login')
      .send({ identifier: TEST_USERNAME, password: TEST_PASSWORD });

    expect(res.status).toBe(200);

    const stored = await redis.get(`refresh:${userId}`);
    expect(stored).toBe(res.body.refreshToken);
  });

  test('Access token je validan JWT sa tačnim podacima', async () => {
    const jwt = require('jsonwebtoken');

    const res = await request(BASE_URL)
      .post('/api/authentication/login')
      .send({ identifier: TEST_USERNAME, password: TEST_PASSWORD });

    expect(res.status).toBe(200);

    const decoded = jwt.verify(res.body.accessToken, process.env.JWT_SECRET);
    expect(decoded).toHaveProperty('userId', userId);
    expect(decoded).toHaveProperty('username', TEST_USERNAME);
  });
});

// =============================================================================
// 3. REFRESH TOKEN
// =============================================================================
describe('POST /api/authentication/refresh', () => {
  let userId;
  let refreshToken;

  beforeAll(async () => {
    userId = await insertTestUser({
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    const res = await request(BASE_URL)
      .post('/api/authentication/login')
      .send({ identifier: TEST_USERNAME, password: TEST_PASSWORD });
    refreshToken = res.body.refreshToken;
  });

  afterAll(async () => {
    await cleanupRefreshTokens(userId);
    await cleanupUsers(TEST_EMAIL);
  });

  test('Uspešan refresh sa validnim refresh tokenom', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  test('Novi access token je validan JWT', async () => {
    const jwt = require('jsonwebtoken');

    const res = await request(BASE_URL)
      .post('/api/authentication/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.accessToken, process.env.JWT_SECRET);
    expect(decoded).toHaveProperty('userId', userId);
  });

  test('Refresh bez tela vraća 400', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/refresh')
      .send({});

    expect(res.status).toBe(400);
  });

  test('Refresh sa nevalidnim tokenom vraća 403', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/refresh')
      .send({ refreshToken: 'ovo_nije_validan_jwt' });

    expect(res.status).toBe(403);
  });

  test('Refresh sa tokenom koji nije u Redis-u vraća 403', async () => {
    await redis.del(`refresh:${userId}`);

    const res = await request(BASE_URL)
      .post('/api/authentication/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(403);

    await redis.set(`refresh:${userId}`, refreshToken, { EX: 7 * 24 * 60 * 60 });
  });
});

// =============================================================================
// 4. LOGOUT
// =============================================================================
describe('POST /api/authentication/logout', () => {
  let userId;
  let accessToken;
  let refreshToken;

  beforeEach(async () => {
    await cleanupUsers(TEST_EMAIL);
    userId = await insertTestUser({
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    const res = await request(BASE_URL)
      .post('/api/authentication/login')
      .send({ identifier: TEST_USERNAME, password: TEST_PASSWORD });
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  afterEach(async () => {
    await cleanupRefreshTokens(userId);
    await cleanupUsers(TEST_EMAIL);
    await redis.del(`blacklist:${accessToken}`);
  });

  test('Uspešan logout vraća 200', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out');
  });

  test('Nakon logout-a access token je blacklistovan u Redis-u', async () => {
    await request(BASE_URL)
      .post('/api/authentication/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    const blacklisted = await redis.get(`blacklist:${accessToken}`);
    expect(blacklisted).toBe('true');
  });

  test('Nakon logout-a refresh token je obrisan iz Redis-a', async () => {
    await request(BASE_URL)
      .post('/api/authentication/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    const stored = await redis.get(`refresh:${userId}`);
    expect(stored).toBeNull();
  });

  test('Blacklistovan token ne može da pristupi /me', async () => {
    await request(BASE_URL)
      .post('/api/authentication/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    const res = await request(BASE_URL)
      .get('/api/authentication/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(401);
  });

  test('Logout bez autentifikacije vraća 401', async () => {
    const res = await request(BASE_URL)
      .post('/api/authentication/logout')
      .send({});

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// 5. GET /api/authentication/me
// =============================================================================
describe('GET /api/authentication/me', () => {
  let userId;
  let accessToken;

  beforeAll(async () => {
    userId = await insertTestUser({
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    const res = await request(BASE_URL)
      .post('/api/authentication/login')
      .send({ identifier: TEST_USERNAME, password: TEST_PASSWORD });
    accessToken = res.body.accessToken;
  });

  afterAll(async () => {
    await cleanupRefreshTokens(userId);
    await cleanupUsers(TEST_EMAIL);
  });

  test('Dohvat podataka o korisniku sa validnim tokenom', async () => {
    const res = await request(BASE_URL)
      .get('/api/authentication/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      first_name: 'Test',
      last_name: 'Korisnik',
    });
  });

  test('Odgovor ne sadrži password_hash', async () => {
    const res = await request(BASE_URL)
      .get('/api/authentication/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  test('Pristup /me bez tokena vraća 401', async () => {
    const res = await request(BASE_URL).get('/api/authentication/me');

    expect(res.status).toBe(401);
  });

  test('Pristup /me sa nevalidnim tokenom vraća 401', async () => {
    const res = await request(BASE_URL)
      .get('/api/authentication/me')
      .set('Authorization', 'Bearer ovo_nije_token');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// 6. PATCH /api/authentication/me
// =============================================================================
describe('PATCH /api/authentication/me', () => {
  let userId;
  let accessToken;

  beforeEach(async () => {
    await cleanupUsers(TEST_EMAIL);
    userId = await insertTestUser({
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    const res = await request(BASE_URL)
      .post('/api/authentication/login')
      .send({ identifier: TEST_USERNAME, password: TEST_PASSWORD });
    accessToken = res.body.accessToken;
  });

  afterEach(async () => {
    await cleanupRefreshTokens(userId);
    await cleanupUsers(TEST_EMAIL);
  });

  test('Uspešno ažuriranje bio polja', async () => {
    const res = await request(BASE_URL)
      .patch('/api/authentication/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ bio: 'Novi bio tekst' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Updated');

    const [rows] = await db.execute('SELECT bio FROM users WHERE id = ?', [userId]);
    expect(rows[0].bio).toBe('Novi bio tekst');
  });

  test('Uspešno postavljanje profila na privatan', async () => {
    const res = await request(BASE_URL)
      .patch('/api/authentication/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isPrivate: true });

    expect(res.status).toBe(200);

    const [rows] = await db.execute('SELECT is_private FROM users WHERE id = ?', [userId]);
    expect(rows[0].is_private).toBe(1);
  });

  test('Uspešno postavljanje profila na javni', async () => {
    const res = await request(BASE_URL)
      .patch('/api/authentication/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isPrivate: false });

    expect(res.status).toBe(200);

    const [rows] = await db.execute('SELECT is_private FROM users WHERE id = ?', [userId]);
    expect(rows[0].is_private).toBe(0);
  });

  test('Promena lozinke bez currentPassword vraća 400', async () => {
    const res = await request(BASE_URL)
      .patch('/api/authentication/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: 'NovaLozinka123!' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Current password required');
  });

  test('Promena lozinke sa pogrešnom trenutnom lozinkom vraća 401', async () => {
    const res = await request(BASE_URL)
      .patch('/api/authentication/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: 'NovaLozinka123!', currentPassword: 'pogresna_lozinka' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Incorrect current password');
  });

  test('Uspešna promena lozinke — login sa novom lozinkom radi', async () => {
    await request(BASE_URL)
      .patch('/api/authentication/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: 'NovaLozinka123!', currentPassword: TEST_PASSWORD });

    const loginRes = await request(BASE_URL)
      .post('/api/authentication/login')
      .send({ identifier: TEST_USERNAME, password: 'NovaLozinka123!' });

    expect(loginRes.status).toBe(200);
  });

  test('Stara lozinka ne radi nakon promene', async () => {
    await request(BASE_URL)
      .patch('/api/authentication/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: 'NovaLozinka123!', currentPassword: TEST_PASSWORD });

    const loginRes = await request(BASE_URL)
      .post('/api/authentication/login')
      .send({ identifier: TEST_USERNAME, password: TEST_PASSWORD });

    expect(loginRes.status).toBe(401);
  });

  test('PATCH /me bez tokena vraća 401', async () => {
    const res = await request(BASE_URL)
      .patch('/api/authentication/me')
      .send({ bio: 'Bio bez tokena' });

    expect(res.status).toBe(401);
  });
});