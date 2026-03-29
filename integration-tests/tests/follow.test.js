/**
 * API Integracioni testovi – Follow Service
 *
 * Javne rute (namenjene frontendu) → kroz API Gateway (port 4000)
 * Interne rute (između servisa) → direktno na follow servis (port 3004)
 *
 * Pre pokretanja mora biti pokrenut ceo Docker:
 *   docker compose up -d
 *
 * Pokretanje (iz integration-tests foldera):
 *   npm test -- tests/follow.test.js
 */

const request = require('supertest');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';
const FOLLOW_URL  = process.env.FOLLOW_SERVICE_URL || 'http://localhost:3004';

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

const cleanupBlocks = async (blockerId, blockedId) => {
  await followDb.execute(
    'DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?',
    [blockerId, blockedId]
  );
};

// ─── TEST PODACI ──────────────────────────────────────────────────────────────

const USER_A        = { username: 'follow_test_a',      email: 'follow_test_a@test.com',      password: 'TestLozinka123!' };
const USER_B_PUBLIC = { username: 'follow_test_b_pub',  email: 'follow_test_b_pub@test.com',  password: 'TestLozinka123!', isPrivate: 0 };
const USER_B_PRIVATE= { username: 'follow_test_b_priv', email: 'follow_test_b_priv@test.com', password: 'TestLozinka123!', isPrivate: 1 };

// =============================================================================
// 1. PRAĆENJE JAVNOG PROFILA (kroz gateway)
// =============================================================================
describe('Praćenje javnog profila', () => {
  let userAId, userBId, tokenA;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PUBLIC);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
  });

  afterAll(async () => {
    await cleanupFollows(userAId, userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email);
  });

  test('Slanje zahteva za praćenje javnog profila — automatski prihvaćen', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACCEPTED');
    expect(res.body.message).toBe('Uspešno zapraćeno.');
  });

  test('Ne može se zapratiti isti profil dva puta', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Već postoji zahtev ili veza praćenja.');
  });

  test('Ne može se pratiti sam sebe', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userAId });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Ne možete pratiti sami sebe.');
  });

  test('Follow bez autentifikacije vraća 401', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/follow')
      .send({ following_id: userBId });

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// 2. PRAĆENJE PRIVATNOG PROFILA (kroz gateway)
// =============================================================================
describe('Praćenje privatnog profila', () => {
  let userAId, userBId, tokenA, tokenB;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PRIVATE);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
    tokenB  = await loginUser(USER_B_PRIVATE.email, USER_B_PRIVATE.password);
  });

  afterAll(async () => {
    await cleanupFollows(userAId, userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PRIVATE.email);
  });

  test('Slanje zahteva za praćenje privatnog profila — status PENDING', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.message).toBe('Zahtev za praćenje poslat.');
  });

  test('Prihvatanje zahteva za praćenje', async () => {
    const res = await request(GATEWAY_URL)
      .put('/api/follow/accept')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ follower_id: userAId });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Zahtev prihvaćen.');

    const [rows] = await followDb.execute(
      'SELECT status FROM follows WHERE follower_id = ? AND following_id = ?',
      [userAId, userBId]
    );
    expect(rows[0].status).toBe('ACCEPTED');
  });
});

// =============================================================================
// 3. ODBIJANJE ZAHTEVA (kroz gateway)
// =============================================================================
describe('Odbijanje zahteva za praćenje', () => {
  let userAId, userBId, tokenA, tokenB;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PRIVATE);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
    tokenB  = await loginUser(USER_B_PRIVATE.email, USER_B_PRIVATE.password);

    await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });
  });

  afterAll(async () => {
    await cleanupFollows(userAId, userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PRIVATE.email);
  });

  test('Odbijanje zahteva za praćenje', async () => {
    const res = await request(GATEWAY_URL)
      .delete('/api/follow/reject')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ follower_id: userAId });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Zahtev odbijen.');

    const [rows] = await followDb.execute(
      'SELECT * FROM follows WHERE follower_id = ? AND following_id = ?',
      [userAId, userBId]
    );
    expect(rows.length).toBe(0);
  });

  test('Odbijanje nepostojećeg zahteva vraća 404', async () => {
    const res = await request(GATEWAY_URL)
      .delete('/api/follow/reject')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ follower_id: userAId });

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// 4. PREKID PRAĆENJA (kroz gateway)
// =============================================================================
describe('Prekid praćenja (unfollow)', () => {
  let userAId, userBId, tokenA;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PUBLIC);
    tokenA  = await loginUser(USER_A.email, USER_A.password);

    await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });
  });

  afterAll(async () => {
    await cleanupFollows(userAId, userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email);
  });

  test('Uspešan unfollow', async () => {
    const res = await request(GATEWAY_URL)
      .delete('/api/unfollow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Uspešno otpraćeno.');

    const [rows] = await followDb.execute(
      'SELECT * FROM follows WHERE follower_id = ? AND following_id = ?',
      [userAId, userBId]
    );
    expect(rows.length).toBe(0);
  });

  test('Unfollow nepostojećeg praćenja vraća 404', async () => {
    const res = await request(GATEWAY_URL)
      .delete('/api/unfollow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// 5. UKLANJANJE PRATIOCA (direktno na follow servis)
// =============================================================================
describe('Uklanjanje pratioca', () => {
  let userAId, userBId, tokenA, tokenB;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PUBLIC);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
    tokenB  = await loginUser(USER_B_PUBLIC.email, USER_B_PUBLIC.password);

    await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });
  });

  afterAll(async () => {
    await cleanupFollows(userAId, userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email);
  });

  test('B uklanja A kao pratioca', async () => {
    const res = await request(FOLLOW_URL)
      .delete('/followers/remove')
      .set('x-user-id', String(userBId))
      .send({ follower_id: userAId });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Pratilac je uklonjen.');

    const [rows] = await followDb.execute(
      'SELECT * FROM follows WHERE follower_id = ? AND following_id = ?',
      [userAId, userBId]
    );
    expect(rows.length).toBe(0);
  });

  test('Uklanjanje nepostojećeg pratioca vraća 404', async () => {
    const res = await request(FOLLOW_URL)
      .delete('/followers/remove')
      .set('x-user-id', String(userBId))
      .send({ follower_id: userAId });

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// 6. BLOKIRANJE (kroz gateway)
// =============================================================================
describe('Blokiranje korisnika', () => {
  let userAId, userBId, tokenA;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PUBLIC);
    tokenA  = await loginUser(USER_A.email, USER_A.password);

    await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });
  });

  afterAll(async () => {
    await cleanupFollows(userAId, userBId);
    await cleanupBlocks(userAId, userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email);
  });

  test('Uspešno blokiranje korisnika', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/block')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ blocked_id: userBId });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Korisnik je blokiran i follow veze su uklonjene.');
  });

  test('Blokiranje briše follow veze', async () => {
    const [rows] = await followDb.execute(
      'SELECT * FROM follows WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)',
      [userAId, userBId, userBId, userAId]
    );
    expect(rows.length).toBe(0);
  });

  test('Ne može se blokirati isti korisnik dva puta', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/block')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ blocked_id: userBId });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Korisnik je već blokiran.');
  });

  test('Ne može se pratiti blokiran korisnik', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });

    expect(res.status).toBe(400);
  });

  test('Ne može se blokirati sam sebe', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/block')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ blocked_id: userAId });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Ne možete blokirati sami sebe.');
  });
});

// =============================================================================
// 7. ODBLOKIRANJE (kroz gateway)
// =============================================================================
describe('Odblokiranje korisnika', () => {
  let userAId, userBId, tokenA;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PUBLIC);
    tokenA  = await loginUser(USER_A.email, USER_A.password);

    await request(GATEWAY_URL)
      .post('/api/block')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ blocked_id: userBId });
  });

  afterAll(async () => {
    await cleanupBlocks(userAId, userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email);
  });

  test('Uspešno odblokiranje', async () => {
    const res = await request(GATEWAY_URL)
      .delete('/api/block')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ blocked_id: userBId });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Korisnik je odblokiran.');

    const [rows] = await followDb.execute(
      'SELECT * FROM blocks WHERE blocker_id = ? AND blocked_id = ?',
      [userAId, userBId]
    );
    expect(rows.length).toBe(0);
  });

  test('Odblokiranje nepostojećeg bloka vraća 404', async () => {
    const res = await request(GATEWAY_URL)
      .delete('/api/block')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ blocked_id: userBId });

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// 8. STATISTIKE (direktno na follow servis)
// =============================================================================
describe('Statistike', () => {
  let userAId, userBId, tokenA;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PUBLIC);
    tokenA  = await loginUser(USER_A.email, USER_A.password);

    await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });
  });

  afterAll(async () => {
    await cleanupFollows(userAId, userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email);
  });

  test('A prati 1, ima 0 pratilaca', async () => {
    const res = await request(FOLLOW_URL)
      .get(`/stats/${userAId}`)
      .set('x-user-id', String(userAId));

    expect(res.status).toBe(200);
    expect(res.body.following).toBe(1);
    expect(res.body.followers).toBe(0);
  });

  test('B prati 0, ima 1 pratioca', async () => {
    const res = await request(FOLLOW_URL)
      .get(`/stats/${userBId}`)
      .set('x-user-id', String(userBId));

    expect(res.status).toBe(200);
    expect(res.body.following).toBe(0);
    expect(res.body.followers).toBe(1);
  });
});

// =============================================================================
// 9. LISTE (kroz gateway)
// =============================================================================
describe('Liste pratilaca', () => {
  let userAId, userBId, tokenA, tokenB;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PUBLIC);
    tokenA  = await loginUser(USER_A.email, USER_A.password);
    tokenB  = await loginUser(USER_B_PUBLIC.email, USER_B_PUBLIC.password);

    await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });
  });

  afterAll(async () => {
    await cleanupFollows(userAId, userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email);
  });

  test('Lista korisnika koje A prati sadrži B', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/follow/following')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.following).toContain(userBId);
  });

  test('Lista pratilaca B sadrži A', async () => {
    const res = await request(GATEWAY_URL)
      .get('/api/follow/followers')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.followers).toContain(userAId);
  });
});

// =============================================================================
// 10. RELATIONSHIP STATUS (direktno na follow servis)
// =============================================================================
describe('Relationship status', () => {
  let userAId, userBId, tokenA;

  beforeAll(async () => {
    userAId = await insertAuthUser(USER_A);
    userBId = await insertAuthUser(USER_B_PUBLIC);
    tokenA  = await loginUser(USER_A.email, USER_A.password);

    await request(GATEWAY_URL)
      .post('/api/follow')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ following_id: userBId });
  });

  afterAll(async () => {
    await cleanupFollows(userAId, userBId);
    await cleanupAuthUsers(USER_A.email, USER_B_PUBLIC.email);
  });

  test('Relationship status između A i B je ACCEPTED', async () => {
    const res = await request(FOLLOW_URL)
      .get(`/relationship-status?following_id=${userBId}`)
      .set('x-user-id', String(userAId));

    expect(res.status).toBe(200);
    expect(res.body.followStatus).toBe('ACCEPTED');
    expect(res.body.blocked).toBe(false);
  });

  test('Relationship status za nepostojećeg korisnika je NONE', async () => {
    const res = await request(FOLLOW_URL)
      .get(`/relationship-status?following_id=99999`)
      .set('x-user-id', String(userAId));

    expect(res.status).toBe(200);
    expect(res.body.followStatus).toBe('NONE');
  });
});