import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, onSessionExpired } from './api';

type Reply = { status: number; body?: unknown };

function mockFetch(replies: Record<string, Reply[]>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const queue = replies[url];
    const reply = queue?.shift() ?? { status: 500 };
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

beforeEach(() => {
  document.cookie = 'pb_csrf=csrf-123';
});
afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('sends the CSRF header on mutations only', async () => {
    const calls = mockFetch({
      '/api/v1/a': [{ status: 200, body: {} }],
      '/api/v1/b': [{ status: 200, body: {} }],
    });
    await api.get('/a');
    await api.post('/b', { x: 1 });
    expect((calls[0]?.init.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
    expect((calls[1]?.init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-123');
  });

  it('refreshes once and retries when the access token expired', async () => {
    const calls = mockFetch({
      '/api/v1/me': [{ status: 401 }, { status: 200, body: { ok: true } }],
      '/api/v1/auth/refresh': [{ status: 200, body: {} }],
    });
    await expect(api.get('/me')).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c.url)).toEqual(['/api/v1/me', '/api/v1/auth/refresh', '/api/v1/me']);
  });

  it('shares one refresh between concurrent requests', async () => {
    const calls = mockFetch({
      '/api/v1/a': [{ status: 401 }, { status: 200, body: 1 }],
      '/api/v1/b': [{ status: 401 }, { status: 200, body: 2 }],
      '/api/v1/auth/refresh': [{ status: 200, body: {} }],
    });
    await Promise.all([api.get('/a'), api.get('/b')]);
    expect(calls.filter((c) => c.url === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('announces an expired session when refreshing fails', async () => {
    mockFetch({
      '/api/v1/me': [{ status: 401, body: { message: 'Session expired', code: 'UNAUTHORIZED' } }],
      '/api/v1/auth/refresh': [{ status: 401 }],
    });
    const listener = vi.fn();
    const stop = onSessionExpired(listener);
    await expect(api.get('/me')).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledOnce();
    stop();
  });

  it('does not try to refresh after a failed login', async () => {
    const calls = mockFetch({
      '/api/v1/auth/login': [
        { status: 401, body: { message: 'Incorrect email or password', code: 'UNAUTHORIZED' } },
      ],
    });
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({
      message: 'Incorrect email or password',
    });
    expect(calls).toHaveLength(1);
  });

  it('exposes field errors from validation responses', async () => {
    mockFetch({
      '/api/v1/x': [
        {
          status: 400,
          body: {
            message: 'Some fields are invalid',
            code: 'VALIDATION_ERROR',
            details: [{ path: 'name', message: 'Too short' }],
          },
        },
      ],
    });
    const error = (await api.post('/x').catch((e: unknown) => e)) as ApiError;
    expect(error.fieldErrors()).toEqual({ name: 'Too short' });
  });
});

describe('initial account check', () => {
  it('a visitor without a session is not told their session expired', async () => {
    mockFetch({
      '/api/v1/auth/me': [
        { status: 401, body: { message: 'Authentication required', code: 'UNAUTHORIZED' } },
      ],
      '/api/v1/auth/refresh': [{ status: 401 }],
    });
    const listener = vi.fn();
    const stop = onSessionExpired(listener);
    await expect(api.get('/auth/me', { announceExpiry: false })).rejects.toMatchObject({
      status: 401,
    });
    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it('a returning visitor with a valid refresh cookie is signed back in', async () => {
    mockFetch({
      '/api/v1/auth/me': [{ status: 401 }, { status: 200, body: { user: { id: '1' } } }],
      '/api/v1/auth/refresh': [{ status: 200, body: {} }],
    });
    await expect(api.get('/auth/me', { announceExpiry: false })).resolves.toEqual({
      user: { id: '1' },
    });
  });
});
