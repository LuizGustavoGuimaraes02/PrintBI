import type { ApiErrorBody } from '@printbi/shared';

const BASE = '/api/v1';
const CSRF_COOKIE = 'pb_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD']);

export class ApiError extends Error {
  override name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorBody['details'] = [],
  ) {
    super(message);
  }

  /** Field-level messages keyed by path, ready for a form. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.details ?? []).map((d) => [d.path, d.message]));
  }
}

export function readCookie(name: string): string | undefined {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

type SessionListener = () => void;
const sessionExpiredListeners = new Set<SessionListener>();

/** Called when the session cannot be renewed: the app clears its state and shows sign-in. */
export function onSessionExpired(listener: SessionListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

let refreshing: Promise<boolean> | null = null;

/**
 * Renews the session once, however many requests failed at the same time.
 * Concurrent callers share the same in-flight refresh.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= send('POST', '/auth/refresh')
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function send(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!SAFE_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  return fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function toError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
  return new ApiError(
    res.status,
    body?.code ?? 'HTTP_ERROR',
    body?.message ?? 'Something went wrong. Please try again.',
    body?.details,
  );
}

/** Routes where a 401 means "wrong credentials", not "session expired". */
const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

export interface RequestOptions {
  /**
   * Announce a session that cannot be renewed (default true). The initial "who am I" check
   * turns this off: a visitor who never signed in has no session to lose.
   */
  announceExpiry?: boolean;
  /** Extra headers, such as the Idempotency-Key of a stock operation. */
  headers?: Record<string, string>;
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  { announceExpiry = true, headers }: RequestOptions = {},
): Promise<T> {
  let res = await send(method, path, body, headers);

  if (res.status === 401 && !NO_REFRESH.includes(path)) {
    if (await refreshSession()) {
      res = await send(method, path, body, headers);
    }
    if (res.status === 401 && announceExpiry) {
      sessionExpiredListeners.forEach((listener) => listener());
    }
  }

  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body: unknown = {}, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
};
