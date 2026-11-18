import type { Express } from 'express';
import request, { type Response } from 'supertest';

let sequence = 0;

/**
 * A browser-like test client: keeps cookies between requests and echoes the CSRF
 * cookie in the X-CSRF-Token header, like the web app does.
 */
export class TestClient {
  readonly agent;
  csrf: string | undefined;
  refreshToken: string | undefined;

  constructor(app: Express) {
    this.agent = request.agent(app);
  }

  private capture = (res: Response): Response => {
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    for (const cookie of cookies) {
      const [pair = ''] = cookie.split(';');
      const [name, value] = pair.split('=');
      if (name === 'pb_csrf') this.csrf = value || undefined;
      if (name === 'pb_refresh') this.refreshToken = value || undefined;
    }
    return res;
  };

  private withCsrf<T extends request.Test>(req: T): T {
    return this.csrf ? req.set('X-CSRF-Token', this.csrf) : req;
  }

  get(url: string) {
    return this.agent.get(url).then(this.capture);
  }
  post(url: string, body: object = {}) {
    return this.withCsrf(this.agent.post(url)).send(body).then(this.capture);
  }
  put(url: string, body: object = {}) {
    return this.withCsrf(this.agent.put(url)).send(body).then(this.capture);
  }
  patch(url: string, body: object = {}) {
    return this.withCsrf(this.agent.patch(url)).send(body).then(this.capture);
  }
  delete(url: string) {
    return this.withCsrf(this.agent.delete(url)).then(this.capture);
  }
}

export const PASSWORD = 'print3dRocks';

export function uniqueEmail(label = 'user'): string {
  sequence += 1;
  return `${label}${sequence}-${Date.now()}@example.com`;
}

export async function registerClient(app: Express, email = uniqueEmail()) {
  const client = new TestClient(app);
  const res = await client.post('/api/v1/auth/register', {
    firstName: 'Test',
    lastName: 'User',
    email,
    password: PASSWORD,
  });
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { client, email, userId: res.body.user.id as string };
}

export async function registerWithCompany(app: Express, companyName = 'Layer Lab') {
  const registered = await registerClient(app);
  const res = await registered.client.post('/api/v1/companies', { name: companyName });
  if (res.status !== 201)
    throw new Error(`company failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...registered, companyId: res.body.activeCompany.id as string };
}
