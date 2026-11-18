import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

const app = createApp({ corsOrigins: ['http://localhost:5173'] });

describe('app', () => {
  it('answers liveness on /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('reports not ready when the database is down', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable', database: 'down' });
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/anything')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Malformed JSON body', code: 'BAD_REQUEST' });
  });

  it('rejects bodies over the size limit with 413', async () => {
    const res = await request(app)
      .post('/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(200_000) }));
    expect(res.status).toBe(413);
  });

  it('allows only configured CORS origins, with credentials', async () => {
    const allowed = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const blocked = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
