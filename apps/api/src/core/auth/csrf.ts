import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ForbiddenError } from '../errors';
import { ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER, REFRESH_COOKIE } from './cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function sameValue(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

/**
 * Double-submit CSRF check, on top of SameSite=Strict cookies. Any state-changing
 * request that carries session cookies must echo the CSRF cookie in a header,
 * which a cross-site page cannot read.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
  const hasSession = Boolean(cookies[ACCESS_COOKIE] ?? cookies[REFRESH_COOKIE]);
  if (!hasSession) return next();

  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);
  if (!cookieToken || !headerToken || !sameValue(cookieToken, headerToken)) {
    throw new ForbiddenError('Invalid or missing CSRF token');
  }
  next();
};
