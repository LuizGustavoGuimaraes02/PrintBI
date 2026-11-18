import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/core/auth/tokens';
import { CompanyModel } from '../src/modules/companies/company.model';
import { registerClient, registerWithCompany, TestClient } from './client';
import { connectTestDatabase } from './memory-db';

const app = createApp();
let teardown: () => Promise<void>;

beforeAll(async () => {
  teardown = await connectTestDatabase();
});
afterAll(async () => teardown());

/** Admin of a company plus an employee who joined through an invite. */
async function companyWithEmployee(finance = false) {
  const admin = await registerWithCompany(app, 'Filament Works');
  const employee = await registerClient(app);
  const invite = await admin.client.post('/api/v1/companies/current/invites', {
    email: employee.email,
    role: 'employee',
    finance,
  });
  const token = new URL(invite.body.link).pathname.split('/').pop() ?? '';
  const accepted = await employee.client.post('/api/v1/invites/accept', { token });
  expect(accepted.status).toBe(200);
  return { admin, employee };
}

describe('company creation', () => {
  it('makes the creator admin and switches the session to the new company', async () => {
    const { client } = await registerClient(app);
    const res = await client.post('/api/v1/companies', { name: 'Layer Lab' });
    expect(res.status).toBe(201);
    expect(res.body.activeCompany).toMatchObject({ name: 'Layer Lab', role: 'admin' });
    expect(res.body.activeCompany.permissions).toContain('members:manage');

    const current = await client.get('/api/v1/companies/current');
    expect(current.body.name).toBe('Layer Lab');
  });

  it('requires a company before company routes', async () => {
    const { client } = await registerClient(app);
    const res = await client.get('/api/v1/companies/current');
    expect(res.status).toBe(403);
  });
});

describe('isolation between companies', () => {
  it('cannot switch into a company it does not belong to', async () => {
    const a = await registerWithCompany(app, 'Company A');
    const b = await registerWithCompany(app, 'Company B');
    const res = await b.client.post('/api/v1/auth/switch-company', { companyId: a.companyId });
    expect(res.status).toBe(404);
  });

  it('a forged token pointing at another company grants nothing', async () => {
    const a = await registerWithCompany(app, 'Company A');
    const b = await registerWithCompany(app, 'Company B');
    const me = await b.client.get('/api/v1/auth/me');
    expect(me.body.activeCompany.id).toBe(b.companyId);

    // Simulates a stolen secret or a bug that put company A in B's token.
    const forged = await signAccessToken({
      sub: b.userId,
      sid: (await sessionIdOf(b.client)) ?? '',
      cid: a.companyId,
    });
    const res = await request(app)
      .get('/api/v1/companies/current/members')
      .set('Cookie', `pb_access=${forged}`);
    expect(res.status).toBe(403);
  });

  it('only lists members of the active company and cannot touch outsiders', async () => {
    const a = await registerWithCompany(app, 'Company A');
    const b = await registerWithCompany(app, 'Company B');

    const members = await b.client.get('/api/v1/companies/current/members');
    expect(members.body.map((m: { userId: string }) => m.userId)).toEqual([b.userId]);

    const patch = await b.client.patch(`/api/v1/companies/current/members/${a.userId}`, {
      finance: true,
    });
    expect(patch.status).toBe(404);
  });

  it('rejects malformed ids with 400, never 500', async () => {
    const b = await registerWithCompany(app);
    const res = await b.client.patch('/api/v1/companies/current/members/not-an-id', {
      finance: true,
    });
    expect(res.status).toBe(400);
  });
});

describe('roles and permissions', () => {
  it('employees cannot manage members or settings', async () => {
    const { employee } = await companyWithEmployee();
    expect((await employee.client.get('/api/v1/companies/current/members')).status).toBe(200);
    expect(
      (await employee.client.post('/api/v1/companies/current/invites', { email: 'x@example.com' }))
        .status,
    ).toBe(403);
    expect(
      (await employee.client.patch('/api/v1/companies/current', { name: 'Hacked' })).status,
    ).toBe(403);
  });

  it('employees get financial access only when the admin enables it, immediately', async () => {
    const { admin, employee } = await companyWithEmployee();
    let me = await employee.client.get('/api/v1/auth/me');
    expect(me.body.activeCompany.permissions).toEqual([]);

    await admin.client.patch(`/api/v1/companies/current/members/${employee.userId}`, {
      finance: true,
    });
    me = await employee.client.get('/api/v1/auth/me');
    expect(me.body.activeCompany.permissions).toEqual(['finance:view', 'finance:manage']);
  });

  it('removing a member ends their access on the next request', async () => {
    const { admin, employee } = await companyWithEmployee();
    const removed = await admin.client.delete(
      `/api/v1/companies/current/members/${employee.userId}`,
    );
    expect(removed.status).toBe(204);
    expect((await employee.client.get('/api/v1/companies/current')).status).toBe(403);
  });

  it('never leaves a company without an admin', async () => {
    const admin = await registerWithCompany(app);
    const demote = await admin.client.patch(`/api/v1/companies/current/members/${admin.userId}`, {
      role: 'employee',
    });
    expect(demote.status).toBe(409);
    expect(demote.body.code).toBe('LAST_ADMIN');
  });

  it('admins update the business profile', async () => {
    const admin = await registerWithCompany(app);
    const res = await admin.client.patch('/api/v1/companies/current', {
      phone: '+1 555 0100',
      email: 'Hello@LayerLab.com',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: '+1 555 0100', email: 'hello@layerlab.com' });
  });
});

describe('invites', () => {
  async function inviteFor(admin: Awaited<ReturnType<typeof registerWithCompany>>, email: string) {
    const res = await admin.client.post('/api/v1/companies/current/invites', { email });
    expect(res.status).toBe(201);
    return new URL(res.body.link).pathname.split('/').pop() ?? '';
  }

  it('shows a public preview of a valid invite', async () => {
    const admin = await registerWithCompany(app, 'Preview Prints');
    const token = await inviteFor(admin, 'guest@example.com');
    const res = await new TestClient(app).get(`/api/v1/invites/${token}`);
    expect(res.body).toEqual({
      companyName: 'Preview Prints',
      email: 'guest@example.com',
      role: 'employee',
      status: 'valid',
    });
  });

  it('is bound to the invited email', async () => {
    const admin = await registerWithCompany(app);
    const token = await inviteFor(admin, 'intended@example.com');
    const intruder = await registerClient(app);
    const res = await intruder.client.post('/api/v1/invites/accept', { token });
    expect(res.status).toBe(403);
  });

  it('works only once', async () => {
    const admin = await registerWithCompany(app);
    const employee = await registerClient(app);
    const token = await inviteFor(admin, employee.email);
    expect((await employee.client.post('/api/v1/invites/accept', { token })).status).toBe(200);
    const again = await employee.client.post('/api/v1/invites/accept', { token });
    expect(again.status).toBe(410);
    expect(again.body.code).toBe('INVITE_USED');
  });

  it('expires', async () => {
    const admin = await registerWithCompany(app);
    const employee = await registerClient(app);
    const token = await inviteFor(admin, employee.email);
    await CompanyModel.updateOne(
      { _id: admin.companyId },
      { $set: { 'invites.$[].expiresAt': new Date(Date.now() - 1000) } },
    );
    const res = await employee.client.post('/api/v1/invites/accept', { token });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('INVITE_EXPIRED');
  });

  it('a new invite for the same email replaces the old link; revoked links stop working', async () => {
    const admin = await registerWithCompany(app);
    const employee = await registerClient(app);
    const oldToken = await inviteFor(admin, employee.email);
    await inviteFor(admin, employee.email);

    const pending = await admin.client.get('/api/v1/companies/current/invites');
    expect(pending.body).toHaveLength(1);

    const res = await employee.client.post('/api/v1/invites/accept', { token: oldToken });
    expect(res.body.code).toBe('INVITE_REVOKED');

    const revoke = await admin.client.delete(
      `/api/v1/companies/current/invites/${pending.body[0].id}`,
    );
    expect(revoke.status).toBe(204);
    expect((await admin.client.get('/api/v1/companies/current/invites')).body).toHaveLength(0);
  });

  it('cannot invite someone who is already a member', async () => {
    const admin = await registerWithCompany(app);
    const res = await admin.client.post('/api/v1/companies/current/invites', {
      email: admin.email,
    });
    expect(res.status).toBe(409);
  });
});

async function sessionIdOf(client: TestClient): Promise<string | undefined> {
  const { UserModel } = await import('../src/modules/users/user.model');
  const me = await client.get('/api/v1/auth/me');
  const user = await UserModel.findById(me.body.user.id, { sessions: 1 }).lean();
  return user?.sessions[0]?._id.toString();
}
