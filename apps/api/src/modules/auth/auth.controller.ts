import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  switchCompanySchema,
} from '@printbi/shared';
import type { Request, RequestHandler, Response } from 'express';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { getAuth } from '../../core/auth/authenticate';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../../core/auth/cookies';
import { UnauthorizedError } from '../../core/errors';
import { parseInput } from '../../core/http/validate';
import { logger } from '../../core/logger';
import { getAccount } from '../users/account.service';
import * as authService from './auth.service';
import { issueTokens } from './issue-tokens';
import {
  closeAllSessions,
  closeSessionByToken,
  rotateSession,
  type OpenedSession,
} from './sessions';

const meta = (req: Request) => ({ userAgent: req.get('user-agent') });

const refreshCookie = (req: Request) =>
  (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];

/** Sets the cookies for a session and answers with the account view. */
async function respondWithSession(res: Response, session: OpenedSession, status = 200) {
  const tokens = await issueTokens(
    session.userId,
    session.sessionId,
    session.companyId,
    session.refreshToken,
  );
  setAuthCookies(res, tokens);
  res.status(status).json(await getAccount(session.userId, session.companyId));
}

export const register: RequestHandler = async (req, res) => {
  const session = await authService.register(parseInput(registerSchema, req.body), meta(req));
  await respondWithSession(res, session, 201);
};

export const login: RequestHandler = async (req, res) => {
  const session = await authService.login(parseInput(loginSchema, req.body), meta(req));
  await respondWithSession(res, session);
};

export const refresh: RequestHandler = async (req, res) => {
  const token = refreshCookie(req);
  if (!token) throw new UnauthorizedError('Session expired');
  try {
    await respondWithSession(res, await rotateSession(token));
  } catch (error) {
    clearAuthCookies(res);
    throw error;
  }
};

export const logout: RequestHandler = async (req, res) => {
  const token = refreshCookie(req);
  if (token) await closeSessionByToken(token);
  clearAuthCookies(res);
  res.status(204).end();
};

export const logoutAll: RequestHandler = async (req, res) => {
  await closeAllSessions(getAuth(req).userId);
  clearAuthCookies(res);
  res.status(204).end();
};

export const me: RequestHandler = async (req, res) => {
  const auth = getAuth(req);
  res.json(await getAccount(auth.userId, auth.companyId));
};

export const forgotPassword: RequestHandler = async (req, res) => {
  const { email } = parseInput(forgotPasswordSchema, req.body);
  const link = await authService.requestPasswordReset(email);
  if (link) {
    // Email delivery is a future feature. Outside production the link is logged for testing;
    // in production nothing secret is logged.
    if (env.NODE_ENV === 'production') {
      logger.warn('Password reset requested, but email delivery is not configured');
    } else {
      logger.info({ resetLink: link }, 'Password reset link (development only)');
    }
  }
  // Same answer whether or not the email exists.
  res.status(204).end();
};

export const resetPassword: RequestHandler = async (req, res) => {
  await authService.resetPassword(parseInput(resetPasswordSchema, req.body));
  clearAuthCookies(res);
  res.status(204).end();
};

export const changePassword: RequestHandler = async (req, res) => {
  const auth = getAuth(req);
  await authService.changePassword(
    auth.userId,
    auth.sessionId,
    parseInput(changePasswordSchema, req.body),
  );
  res.status(204).end();
};

export const switchCompany: RequestHandler = async (req, res) => {
  const auth = getAuth(req);
  const companyId = new Types.ObjectId(parseInput(switchCompanySchema, req.body).companyId);
  await authService.switchCompany(auth.userId, auth.sessionId, companyId);
  setAuthCookies(res, await issueTokens(auth.userId, auth.sessionId, companyId));
  res.json(await getAccount(auth.userId, companyId));
};
