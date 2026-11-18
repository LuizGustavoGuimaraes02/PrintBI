import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env';

export const ACCESS_COOKIE = 'pb_access';
export const REFRESH_COOKIE = 'pb_refresh';
/** Readable by the web app, which echoes it in the X-CSRF-Token header (double submit). */
export const CSRF_COOKIE = 'pb_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const API_PATH = '/api';
/** The refresh token is only ever sent to the auth routes. */
const REFRESH_PATH = '/api/v1/auth';

function base(path: string, maxAgeMs: number, httpOnly = true): CookieOptions {
  return {
    httpOnly,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path,
    maxAge: maxAgeMs,
  };
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken?: string;
  csrfToken: string;
}

export function setAuthCookies(res: Response, tokens: IssuedTokens): void {
  const accessMs = env.ACCESS_TOKEN_TTL_MINUTES * 60_000;
  const refreshMs = env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;
  res.cookie(ACCESS_COOKIE, tokens.accessToken, base(API_PATH, accessMs));
  res.cookie(CSRF_COOKIE, tokens.csrfToken, base('/', refreshMs, false));
  if (tokens.refreshToken) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, base(REFRESH_PATH, refreshMs));
  }
}

/** Express 5 ignores maxAge on clearCookie; path and flags must match how the cookie was set. */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, base(API_PATH, 0));
  res.clearCookie(REFRESH_COOKIE, base(REFRESH_PATH, 0));
  res.clearCookie(CSRF_COOKIE, base('/', 0, false));
}
