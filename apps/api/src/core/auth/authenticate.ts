import { permissionsFor, type Permission, type Role } from '@printbi/shared';
import type { Request, RequestHandler } from 'express';
import { Types } from 'mongoose';
import { UserModel } from '../../modules/users/user.model';
import { ForbiddenError, UnauthorizedError } from '../errors';
import { ACCESS_COOKIE } from './cookies';
import { verifyAccessToken } from './tokens';

export interface AuthContext {
  userId: Types.ObjectId;
  sessionId: Types.ObjectId;
  email: string;
  /** Null when the user has no active company, or was removed from it. */
  companyId: Types.ObjectId | null;
  role: Role | null;
  permissions: Permission[];
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

/**
 * Verifies the access token, then loads the session and the membership in one
 * indexed query. Removing a member, changing a role or signing out takes effect
 * on the very next request, not when the token expires.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = (req.cookies as Record<string, string | undefined> | undefined)?.[ACCESS_COOKIE];
  if (!token) throw new UnauthorizedError();

  const claims = await verifyAccessToken(token);
  if (!Types.ObjectId.isValid(claims.sub) || !Types.ObjectId.isValid(claims.sid)) {
    throw new UnauthorizedError('Invalid session');
  }

  const user = await UserModel.findOne(
    { _id: claims.sub, 'sessions._id': claims.sid },
    { email: 1, memberships: 1 },
  ).lean();
  if (!user) throw new UnauthorizedError('Session expired');

  const membership = claims.cid
    ? user.memberships.find((m) => m.companyId.equals(claims.cid as string))
    : undefined;

  req.auth = {
    userId: user._id,
    sessionId: new Types.ObjectId(claims.sid),
    email: user.email,
    companyId: membership?.companyId ?? null,
    role: membership?.role ?? null,
    permissions: membership ? permissionsFor(membership) : [],
  };
  next();
};

export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}

/** Auth context guaranteed to have an active company. */
export type CompanyAuthContext = AuthContext & { companyId: Types.ObjectId; role: Role };

export function getCompanyAuth(req: Request): CompanyAuthContext {
  const auth = getAuth(req);
  if (!auth.companyId || !auth.role) throw new ForbiddenError('Create or join a company first');
  return auth as CompanyAuthContext;
}

export const requireCompany: RequestHandler = (req, _res, next) => {
  getCompanyAuth(req);
  next();
};

/** Checked on the server for every request; the web app only mirrors it. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const auth = getCompanyAuth(req);
    if (!auth.permissions.includes(permission)) throw new ForbiddenError();
    next();
  };
}
