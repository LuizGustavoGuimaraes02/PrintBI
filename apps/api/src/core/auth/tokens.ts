import { createHash, randomBytes } from 'node:crypto';
import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';
import { env } from '../../config/env';
import { UnauthorizedError } from '../errors';

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const ISSUER = 'printbi-api';
const AUDIENCE = 'printbi-web';

export interface AccessClaims {
  /** User id. */
  sub: string;
  /** Session id: lets logout and "sign out everywhere" take effect immediately. */
  sid: string;
  /** Active company id, or null before the user creates or joins one. */
  cid: string | null;
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ sid: claims.sid, cid: claims.cid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new UnauthorizedError('Invalid session');
    }
    return {
      sub: payload.sub,
      sid: payload.sid,
      cid: typeof payload.cid === 'string' ? payload.cid : null,
    };
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) throw new UnauthorizedError('Session expired');
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError('Invalid session');
  }
}

/** Opaque random token for refresh, reset and invite links (256 bits). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are stored only as SHA-256 hashes: a database leak does not leak usable tokens. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
