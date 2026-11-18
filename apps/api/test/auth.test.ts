import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { requestPasswordReset } from '../src/modules/auth/auth.service';
import { UserModel } from '../src/modules/users/user.model';
import { PASSWORD, registerClient, TestClient, uniqueEmail } from './client';
import { connectTestDatabase } from './memory-db';

const app = createApp();
let teardown: () => Promise<void>;

beforeAll(async () => {
  teardown = await connectTestDatabase();
});
afterAll(async () => teardown());

const cookieHeader = (res: request.Response, name: string) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));

describe('registration', () => {
  it('creates the account, signs in with secure cookies and hides the hash', async () => {
    const client = new TestClient(app);
    const email = uniqueEmail();
    const res = await client.post('/api/v1/auth/register', {
      firstName: ' Luiz ',
      lastName: 'Guimaraes',
      email: email.toUpperCase(),
      password: PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ firstName: 'Luiz', email });
    expect(res.body.activeCompany).toBeNull();
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const access = cookieHeader(res, 'pb_access');
    const refresh = cookieHeader(res, 'pb_refresh');
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Strict/i);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookieHeader(res, 'pb_csrf')).not.toMatch(/HttpOnly/i);

    const stored = await UserModel.findOne({ email }, { passwordHash: 1 }).lean();
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('refuses a duplicate email', async () => {
    const { email } = await registerClient(app);
    const res = await new TestClient(app).post('/api/v1/auth/register', {
      firstName: 'Other',
      lastName: 'Person',
      email,
      password: PASSWORD,
    });
    expect(res.status).toBe(409);
  });

  it('refuses weak passwords with field details', async () => {
    const res = await new TestClient(app).post('/api/v1/auth/register', {
      firstName: 'Luiz',
      lastName: 'Guimaraes',
      email: uniqueEmail(),
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'password' })]),
    );
  });
});

describe('login', () => {
  it('signs in with the right password', async () => {
    const { email } = await registerClient(app);
    const client = new TestClient(app);
    expect((await client.post('/api/v1/auth/login', { email, password: PASSWORD })).status).toBe(
      200,
    );
    expect((await client.get('/api/v1/auth/me')).body.user.email).toBe(email);
  });

  it('answers the same for a wrong password and an unknown email', async () => {
    const { email } = await registerClient(app);
    const wrong = await new TestClient(app).post('/api/v1/auth/login', {
      email,
      password: 'nope12345',
    });
    const unknown = await new TestClient(app).post('/api/v1/auth/login', {
      email: uniqueEmail('ghost'),
      password: PASSWORD,
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('requires a session for /me', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
  });
});

describe('sessions', () => {
  it('rotates the refresh token: each one works only once', async () => {
    const { client } = await registerClient(app);
    const first = client.refreshToken;

    const refreshed = await client.post('/api/v1/auth/refresh');
    expect(refreshed.status).toBe(200);
    expect(client.refreshToken).toBeDefined();
    expect(client.refreshToken).not.toBe(first);

    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`pb_refresh=${first}`, 'pb_csrf=x'])
      .set('X-CSRF-Token', 'x');
    expect(replay.status).toBe(401);
  });

  it('revokes the session when a rotated token is reused later (theft)', async () => {
    const { client, userId } = await registerClient(app);
    const stolen = client.refreshToken;
    await client.post('/api/v1/auth/refresh');
    // Move the rotation outside the grace window used for concurrent tabs.
    await UserModel.updateOne(
      { _id: userId },
      { $set: { 'sessions.$[].rotatedAt': new Date(Date.now() - 60_000) } },
    );

    const attacker = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`pb_refresh=${stolen}`, 'pb_csrf=x'])
      .set('X-CSRF-Token', 'x');
    expect(attacker.status).toBe(401);

    // The legitimate holder is signed out too: the whole session is gone.
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);
    expect((await client.post('/api/v1/auth/refresh')).status).toBe(401);
  });

  it('expires a session after inactivity, on the server', async () => {
    const { client, userId } = await registerClient(app);
    await UserModel.updateOne(
      { _id: userId },
      { $set: { 'sessions.$[].lastUsedAt': new Date(Date.now() - 31 * 60_000) } },
    );
    expect((await client.post('/api/v1/auth/refresh')).status).toBe(401);
  });

  it('logout ends the session immediately, even with a still-valid access token', async () => {
    const { client } = await registerClient(app);
    expect((await client.post('/api/v1/auth/logout')).status).toBe(204);
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('logout-all signs out every device', async () => {
    const { client: laptop, email } = await registerClient(app);
    const phone = new TestClient(app);
    await phone.post('/api/v1/auth/login', { email, password: PASSWORD });

    expect((await laptop.post('/api/v1/auth/logout-all')).status).toBe(204);
    expect((await phone.get('/api/v1/auth/me')).status).toBe(401);
  });
});

describe('CSRF', () => {
  it('rejects state-changing requests with session cookies but no CSRF header', async () => {
    const { client } = await registerClient(app);
    const res = await client.agent.post('/api/v1/companies').send({ name: 'No Header Co' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/CSRF/);
  });
});

describe('password reset', () => {
  it('answers 204 whether or not the email exists', async () => {
    const { email } = await registerClient(app);
    for (const target of [email, uniqueEmail('ghost')]) {
      const res = await new TestClient(app).post('/api/v1/auth/password/forgot', { email: target });
      expect(res.status).toBe(204);
    }
  });

  it('resets with a single-use token and signs out every device', async () => {
    const { client, email } = await registerClient(app);
    const link = await requestPasswordReset(email);
    const token = new URL(link ?? '').searchParams.get('token') ?? '';

    const reset = await new TestClient(app).post('/api/v1/auth/password/reset', {
      token,
      password: 'brandNew42',
    });
    expect(reset.status).toBe(204);
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);

    const again = await new TestClient(app).post('/api/v1/auth/password/reset', {
      token,
      password: 'another42x',
    });
    expect(again.status).toBe(400);

    const login = await new TestClient(app).post('/api/v1/auth/login', {
      email,
      password: 'brandNew42',
    });
    expect(login.status).toBe(200);
  });

  it('refuses an expired token', async () => {
    const { email } = await registerClient(app);
    const token =
      new URL((await requestPasswordReset(email)) ?? '').searchParams.get('token') ?? '';
    await UserModel.updateOne(
      { email },
      { $set: { 'passwordReset.expiresAt': new Date(Date.now() - 1000) } },
    );
    const res = await new TestClient(app).post('/api/v1/auth/password/reset', {
      token,
      password: 'brandNew42',
    });
    expect(res.status).toBe(400);
  });

  it('changing the password keeps this device and signs out the others', async () => {
    const { client: laptop, email } = await registerClient(app);
    const phone = new TestClient(app);
    await phone.post('/api/v1/auth/login', { email, password: PASSWORD });

    const wrong = await laptop.put('/api/v1/auth/password', {
      currentPassword: 'wrong1234',
      newPassword: 'brandNew42',
    });
    expect(wrong.status).toBe(400);

    const ok = await laptop.put('/api/v1/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'brandNew42',
    });
    expect(ok.status).toBe(204);
    expect((await laptop.get('/api/v1/auth/me')).status).toBe(200);
    expect((await phone.get('/api/v1/auth/me')).status).toBe(401);
  });
});
