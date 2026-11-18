import { Types, type ClientSession } from 'mongoose';
import { env } from '../../config/env';
import { hashToken, randomToken } from '../../core/auth/tokens';
import { UnauthorizedError } from '../../core/errors';
import { logger } from '../../core/logger';
import { UserModel } from '../users/user.model';

/** Oldest sessions beyond this are dropped when a new device signs in. */
const MAX_SESSIONS_PER_USER = 10;
/**
 * Two tabs can race to refresh with the same token. Reuse of a just-rotated
 * token inside this window is refused without treating it as theft.
 */
const REUSE_GRACE_MS = 30_000;

export interface SessionMeta {
  userAgent?: string | undefined;
}

export interface OpenedSession {
  userId: Types.ObjectId;
  sessionId: Types.ObjectId;
  companyId: Types.ObjectId | null;
  refreshToken: string;
}

const idleCutoff = (now: Date) => new Date(now.getTime() - env.SESSION_IDLE_MINUTES * 60_000);

export async function openSession(
  userId: Types.ObjectId,
  companyId: Types.ObjectId | null,
  meta: SessionMeta,
): Promise<OpenedSession> {
  const now = new Date();
  const sessionId = new Types.ObjectId();
  const refreshToken = randomToken();

  await UserModel.updateOne({ _id: userId }, { $pull: { sessions: { expiresAt: { $lte: now } } } });
  await UserModel.updateOne(
    { _id: userId },
    {
      $push: {
        sessions: {
          $each: [
            {
              _id: sessionId,
              tokenHash: hashToken(refreshToken),
              companyId,
              userAgent: meta.userAgent?.slice(0, 200),
              createdAt: now,
              lastUsedAt: now,
              expiresAt: new Date(now.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
            },
          ],
          $slice: -MAX_SESSIONS_PER_USER,
        },
      },
    },
  );
  return { userId, sessionId, companyId, refreshToken };
}

/**
 * Exchanges a refresh token for a new one (rotation). Each token works once.
 * Presenting an already-rotated token after the grace window revokes that session,
 * because it means someone else holds a copy.
 */
export async function rotateSession(refreshToken: string): Promise<OpenedSession> {
  const now = new Date();
  const tokenHash = hashToken(refreshToken);

  const user = await UserModel.findOne(
    { 'sessions.tokenHash': tokenHash },
    { sessions: { $elemMatch: { tokenHash } } },
  ).lean();
  const session = user?.sessions[0];

  if (!user || !session) {
    await revokeReusedToken(tokenHash, now);
    throw new UnauthorizedError('Session expired');
  }
  if (session.expiresAt <= now || session.lastUsedAt < idleCutoff(now)) {
    await UserModel.updateOne({ _id: user._id }, { $pull: { sessions: { _id: session._id } } });
    throw new UnauthorizedError('Session expired');
  }

  const nextToken = randomToken();
  // Conditional on the old hash: of two concurrent rotations, only one wins.
  const result = await UserModel.updateOne(
    { _id: user._id, sessions: { $elemMatch: { _id: session._id, tokenHash } } },
    {
      $set: {
        'sessions.$.tokenHash': hashToken(nextToken),
        'sessions.$.previousHash': tokenHash,
        'sessions.$.rotatedAt': now,
        'sessions.$.lastUsedAt': now,
      },
    },
  );
  if (result.modifiedCount !== 1) throw new UnauthorizedError('Session expired');

  return {
    userId: user._id,
    sessionId: session._id,
    companyId: session.companyId ?? null,
    refreshToken: nextToken,
  };
}

async function revokeReusedToken(tokenHash: string, now: Date): Promise<void> {
  const graceStart = new Date(now.getTime() - REUSE_GRACE_MS);
  const result = await UserModel.updateOne(
    { sessions: { $elemMatch: { previousHash: tokenHash, rotatedAt: { $lt: graceStart } } } },
    { $pull: { sessions: { previousHash: tokenHash } } },
  );
  if (result.modifiedCount > 0) {
    logger.warn('Refresh token reuse detected; session revoked');
  }
}

export async function closeSessionByToken(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  await UserModel.updateOne(
    { 'sessions.tokenHash': tokenHash },
    { $pull: { sessions: { tokenHash } } },
  );
}

/** Signs out every device, optionally keeping the current one. */
export async function closeAllSessions(
  userId: Types.ObjectId,
  keepSessionId?: Types.ObjectId,
): Promise<void> {
  const filter = keepSessionId ? { _id: { $ne: keepSessionId } } : {};
  await UserModel.updateOne({ _id: userId }, { $pull: { sessions: filter } });
}

export async function setSessionCompany(
  userId: Types.ObjectId,
  sessionId: Types.ObjectId,
  companyId: Types.ObjectId,
  dbSession?: ClientSession,
): Promise<void> {
  await UserModel.updateOne(
    { _id: userId, 'sessions._id': sessionId },
    { $set: { 'sessions.$.companyId': companyId } },
    { session: dbSession },
  );
}
