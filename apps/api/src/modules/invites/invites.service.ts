import type { createInviteSchema, Role } from '@printbi/shared';
import mongoose, { Types } from 'mongoose';
import type { z } from 'zod';
import { env } from '../../config/env';
import { audit } from '../../core/audit/audit';
import { hashToken, randomToken } from '../../core/auth/tokens';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors';
import { setSessionCompany } from '../auth/sessions';
import { CompanyModel } from '../companies/company.model';
import { UserModel } from '../users/user.model';

const INVITE_TTL_MS = 7 * 86_400_000;

export interface InviteView {
  id: string;
  email: string;
  role: Role;
  finance: boolean;
  createdAt: string;
  expiresAt: string;
}

export type InviteStatus = 'valid' | 'expired' | 'used' | 'revoked';

export interface InvitePreview {
  companyName: string;
  email: string;
  role: Role;
  status: InviteStatus;
}

interface InviteRecord {
  _id: Types.ObjectId;
  email: string;
  role: Role;
  finance?: boolean | null;
  createdAt?: Date | null;
  expiresAt: Date;
  usedAt?: Date | null;
  revokedAt?: Date | null;
}

function statusOf(invite: InviteRecord, now = new Date()): InviteStatus {
  if (invite.revokedAt) return 'revoked';
  if (invite.usedAt) return 'used';
  if (invite.expiresAt <= now) return 'expired';
  return 'valid';
}

function toView(invite: InviteRecord): InviteView {
  return {
    id: invite._id.toString(),
    email: invite.email,
    role: invite.role,
    finance: invite.role === 'admin' || Boolean(invite.finance),
    createdAt: (invite.createdAt ?? new Date()).toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
  };
}

/**
 * Creates an invitation and returns its link. Email delivery is a future feature,
 * so the admin copies the link and sends it. A previous pending invite for the same
 * email is revoked, so only the newest link works.
 */
export async function createInvite(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  input: z.output<typeof createInviteSchema>,
): Promise<{ invite: InviteView; link: string }> {
  const alreadyMember = await UserModel.exists({
    email: input.email,
    'memberships.companyId': companyId,
  });
  if (alreadyMember) throw new ConflictError('This person is already a member');

  const token = randomToken();
  const now = new Date();
  const invite = {
    _id: new Types.ObjectId(),
    email: input.email,
    role: input.role,
    finance: input.finance,
    tokenHash: hashToken(token),
    invitedBy: actorId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
  };

  await CompanyModel.updateOne(
    { _id: companyId },
    { $set: { 'invites.$[pending].revokedAt': now } },
    {
      arrayFilters: [
        { 'pending.email': input.email, 'pending.usedAt': null, 'pending.revokedAt': null },
      ],
    },
  );
  await CompanyModel.updateOne({ _id: companyId }, { $push: { invites: invite } });
  await audit({
    companyId,
    actorId,
    action: 'invite.created',
    entity: 'invite',
    entityId: invite._id,
    changes: { email: input.email, role: input.role, finance: input.finance },
  });

  return { invite: toView(invite), link: `${env.WEB_URL}/invite/${token}` };
}

export async function listPendingInvites(companyId: Types.ObjectId): Promise<InviteView[]> {
  const company = await CompanyModel.findById(companyId, { invites: 1 }).lean();
  const now = new Date();
  return (company?.invites ?? []).filter((invite) => statusOf(invite, now) === 'valid').map(toView);
}

export async function revokeInvite(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  inviteId: Types.ObjectId,
): Promise<void> {
  const result = await CompanyModel.updateOne(
    { _id: companyId, invites: { $elemMatch: { _id: inviteId, usedAt: null, revokedAt: null } } },
    { $set: { 'invites.$.revokedAt': new Date() } },
  );
  if (result.modifiedCount !== 1) throw new NotFoundError('Invite');
  await audit({
    companyId,
    actorId,
    action: 'invite.revoked',
    entity: 'invite',
    entityId: inviteId,
  });
}

async function findByToken(token: string) {
  const tokenHash = hashToken(token);
  const company = await CompanyModel.findOne(
    { 'invites.tokenHash': tokenHash },
    { name: 1, invites: { $elemMatch: { tokenHash } } },
  ).lean();
  const invite = company?.invites[0];
  if (!company || !invite) throw new NotFoundError('Invite');
  return { company, invite };
}

/** Public: lets the invite page show which company is inviting, before sign-in. */
export async function previewInvite(token: string): Promise<InvitePreview> {
  const { company, invite } = await findByToken(token);
  return {
    companyName: company.name,
    email: invite.email,
    role: invite.role,
    status: statusOf(invite),
  };
}

const INVITE_UNUSABLE: Record<Exclude<InviteStatus, 'valid'>, AppError> = {
  expired: new AppError(410, 'INVITE_EXPIRED', 'This invite has expired. Ask for a new one.'),
  used: new AppError(410, 'INVITE_USED', 'This invite has already been used.'),
  revoked: new AppError(410, 'INVITE_REVOKED', 'This invite is no longer valid.'),
};

/**
 * Accepts an invite for the signed-in user. The invite is bound to its email and
 * consumed atomically, so a link works once even under concurrent clicks.
 */
export async function acceptInvite(
  userId: Types.ObjectId,
  userEmail: string,
  sessionId: Types.ObjectId,
  token: string,
): Promise<Types.ObjectId> {
  const { company, invite } = await findByToken(token);
  const status = statusOf(invite);
  if (status !== 'valid') throw INVITE_UNUSABLE[status];
  if (invite.email !== userEmail) {
    throw new ForbiddenError(`This invite was sent to another email. Sign in as ${invite.email}.`);
  }

  await mongoose.connection.transaction(async (session) => {
    const consumed = await CompanyModel.updateOne(
      {
        _id: company._id,
        invites: {
          $elemMatch: {
            _id: invite._id,
            usedAt: null,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          },
        },
      },
      { $set: { 'invites.$.usedAt': new Date(), 'invites.$.usedBy': userId } },
      { session },
    );
    if (consumed.modifiedCount !== 1) throw INVITE_UNUSABLE.used;

    const joined = await UserModel.updateOne(
      { _id: userId, 'memberships.companyId': { $ne: company._id } },
      {
        $push: {
          memberships: {
            companyId: company._id,
            role: invite.role,
            finance: Boolean(invite.finance),
          },
        },
      },
      { session },
    );
    if (joined.modifiedCount !== 1)
      throw new ConflictError('You are already a member of this company');

    await setSessionCompany(userId, sessionId, company._id, session);
    await audit(
      {
        companyId: company._id,
        actorId: userId,
        action: 'invite.accepted',
        entity: 'invite',
        entityId: invite._id,
      },
      session,
    );
  });

  return company._id;
}
