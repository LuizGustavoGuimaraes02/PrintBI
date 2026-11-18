import type {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@printbi/shared';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import { env } from '../../config/env';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../core/auth/passwords';
import { hashToken, randomToken } from '../../core/auth/tokens';
import { AppError, ConflictError, NotFoundError, UnauthorizedError } from '../../core/errors';
import { UserModel } from '../users/user.model';
import {
  closeAllSessions,
  openSession,
  setSessionCompany,
  type OpenedSession,
  type SessionMeta,
} from './sessions';

const RESET_TOKEN_TTL_MS = 30 * 60_000;
const INVALID_CREDENTIALS = 'Incorrect email or password';

export async function register(
  input: z.output<typeof registerSchema>,
  meta: SessionMeta,
): Promise<OpenedSession> {
  if (await UserModel.exists({ email: input.email })) {
    throw new ConflictError('An account with this email already exists');
  }
  const user = await UserModel.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    passwordHash: await hashPassword(input.password),
  });
  return openSession(user._id, null, meta);
}

export async function login(
  input: z.output<typeof loginSchema>,
  meta: SessionMeta,
): Promise<OpenedSession> {
  const user = await UserModel.findOne({ email: input.email }, { passwordHash: 1, memberships: 1 });
  if (!user) {
    await burnPasswordCheck(input.password);
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }
  return openSession(user._id, user.memberships[0]?.companyId ?? null, meta);
}

/**
 * Creates a single-use reset token. Returns the link to deliver, or null when the
 * email is unknown; callers must answer the same way in both cases.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const token = randomToken();
  const user = await UserModel.findOneAndUpdate(
    { email },
    {
      $set: {
        passwordReset: {
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      },
    },
  );
  if (!user) return null;
  return `${env.WEB_URL}/reset-password?token=${token}`;
}

/** Sets a new password, consumes the token and signs out every device. */
export async function resetPassword(input: z.output<typeof resetPasswordSchema>): Promise<void> {
  const passwordHash = await hashPassword(input.password);
  const user = await UserModel.findOneAndUpdate(
    {
      'passwordReset.tokenHash': hashToken(input.token),
      'passwordReset.expiresAt': { $gt: new Date() },
    },
    { $set: { passwordHash, sessions: [] }, $unset: { passwordReset: 1 } },
  );
  if (!user) {
    throw new AppError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired');
  }
}

/** Changes the password and signs out every other device. */
export async function changePassword(
  userId: Types.ObjectId,
  sessionId: Types.ObjectId,
  input: z.output<typeof changePasswordSchema>,
): Promise<void> {
  const user = await UserModel.findById(userId, { passwordHash: 1 });
  if (!user) throw new UnauthorizedError();
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    // 400, not 401: the session is fine, only the confirmation is wrong.
    throw new AppError(400, 'WRONG_PASSWORD', 'Current password is incorrect');
  }
  user.passwordHash = await hashPassword(input.newPassword);
  await user.save();
  await closeAllSessions(userId, sessionId);
}

export async function switchCompany(
  userId: Types.ObjectId,
  sessionId: Types.ObjectId,
  companyId: Types.ObjectId,
): Promise<void> {
  const isMember = await UserModel.exists({ _id: userId, 'memberships.companyId': companyId });
  if (!isMember) throw new NotFoundError('Company');
  await setSessionCompany(userId, sessionId, companyId);
}
