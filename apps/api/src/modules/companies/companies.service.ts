import type {
  CompanyView,
  MemberView,
  updateCompanyProfileSchema,
  updateMemberSchema,
} from '@printbi/shared';
import mongoose, { type Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { AppError, NotFoundError } from '../../core/errors';
import { setSessionCompany } from '../auth/sessions';
import { UserModel } from '../users/user.model';
import { CompanyModel } from './company.model';
import { deleteImage, imageView } from '../../core/media/cloudinary';
import { confirmUpload, logoRule } from '../../core/media/uploads';

const PROFILE_FIELDS = {
  name: 1,
  email: 1,
  phone: 1,
  address: 1,
  website: 1,
  social: 1,
  logo: 1,
} as const;

type CompanyProfileRecord = {
  _id: Types.ObjectId;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  social?: string | null;
  logo?: Parameters<typeof imageView>[0] | null;
};

// Lean reads type embedded images without their _id, which Mongoose does store.
function toCompanyView(record: unknown): CompanyView {
  const company = record as CompanyProfileRecord;
  return {
    id: company._id.toString(),
    name: company.name,
    email: company.email ?? '',
    phone: company.phone ?? '',
    address: company.address ?? '',
    website: company.website ?? '',
    social: company.social ?? '',
    logo: company.logo ? imageView(company.logo) : null,
  };
}

/** Creates a company, makes the creator its admin and switches the session to it. */
export async function createCompany(
  userId: Types.ObjectId,
  sessionId: Types.ObjectId,
  name: string,
): Promise<Types.ObjectId> {
  return mongoose.connection.transaction(async (session) => {
    const [company] = await CompanyModel.create([{ name, createdBy: userId }], { session });
    if (!company) throw new Error('Company was not created');
    await UserModel.updateOne(
      { _id: userId },
      { $push: { memberships: { companyId: company._id, role: 'admin', finance: true } } },
      { session },
    );
    await setSessionCompany(userId, sessionId, company._id, session);
    await audit(
      {
        companyId: company._id,
        actorId: userId,
        action: 'company.created',
        entity: 'company',
        entityId: company._id,
      },
      session,
    );
    return company._id;
  });
}

export async function getCompany(companyId: Types.ObjectId): Promise<CompanyView> {
  const company = await CompanyModel.findById(companyId, PROFILE_FIELDS).lean();
  if (!company) throw new NotFoundError('Company');
  return toCompanyView(company);
}

export async function updateCompanyProfile(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  input: z.output<typeof updateCompanyProfileSchema>,
): Promise<CompanyView> {
  const company = await CompanyModel.findByIdAndUpdate(
    companyId,
    { $set: input },
    {
      returnDocument: 'after',
      runValidators: true,
      projection: PROFILE_FIELDS,
    },
  ).lean();
  if (!company) throw new NotFoundError('Company');
  await audit({
    companyId,
    actorId,
    action: 'company.updated',
    entity: 'company',
    entityId: companyId,
    changes: input,
  });
  return toCompanyView(company);
}

export async function listMembers(companyId: Types.ObjectId): Promise<MemberView[]> {
  const users = await UserModel.find(
    { 'memberships.companyId': companyId },
    { firstName: 1, lastName: 1, email: 1, memberships: { $elemMatch: { companyId } } },
  )
    .sort({ firstName: 1, lastName: 1 })
    .lean();

  return users.flatMap((user) => {
    const membership = user.memberships[0];
    if (!membership) return [];
    return [
      {
        userId: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: membership.role,
        finance: membership.role === 'admin' || membership.finance,
        joinedAt: membership.joinedAt?.toISOString() ?? null,
      },
    ];
  });
}

const LAST_ADMIN = new AppError(
  409,
  'LAST_ADMIN',
  'A company needs at least one admin. Promote someone else first.',
);

async function adminCount(companyId: Types.ObjectId, session: mongoose.ClientSession) {
  return UserModel.countDocuments(
    { memberships: { $elemMatch: { companyId, role: 'admin' } } },
    { session },
  );
}

export async function updateMember(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  userId: Types.ObjectId,
  input: z.output<typeof updateMemberSchema>,
): Promise<MemberView> {
  await mongoose.connection.transaction(async (session) => {
    const target = await UserModel.findOne(
      { _id: userId, 'memberships.companyId': companyId },
      { memberships: { $elemMatch: { companyId } } },
      { session },
    ).lean();
    const current = target?.memberships[0];
    if (!current) throw new NotFoundError('Member');

    if (
      current.role === 'admin' &&
      input.role === 'employee' &&
      (await adminCount(companyId, session)) <= 1
    ) {
      throw LAST_ADMIN;
    }

    const set: Record<string, unknown> = {};
    if (input.role !== undefined) set['memberships.$.role'] = input.role;
    if (input.finance !== undefined) set['memberships.$.finance'] = input.finance;
    await UserModel.updateOne(
      { _id: userId, 'memberships.companyId': companyId },
      { $set: set },
      { session },
    );
    await audit(
      {
        companyId,
        actorId,
        action: 'member.updated',
        entity: 'user',
        entityId: userId,
        changes: input,
      },
      session,
    );
  });

  const member = (await listMembers(companyId)).find((m) => m.userId === userId.toString());
  if (!member) throw new NotFoundError('Member');
  return member;
}

/** Removes a member. Their history stays; their access ends on the next request. */
export async function removeMember(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<void> {
  await mongoose.connection.transaction(async (session) => {
    const target = await UserModel.findOne(
      { _id: userId, 'memberships.companyId': companyId },
      { memberships: { $elemMatch: { companyId } } },
      { session },
    ).lean();
    const current = target?.memberships[0];
    if (!current) throw new NotFoundError('Member');
    if (current.role === 'admin' && (await adminCount(companyId, session)) <= 1) throw LAST_ADMIN;

    await UserModel.updateOne(
      { _id: userId },
      { $pull: { memberships: { companyId } } },
      { session },
    );
    await audit(
      { companyId, actorId, action: 'member.removed', entity: 'user', entityId: userId },
      session,
    );
  });
}

/** Sets the logo from a finished upload; the previous file is deleted. */
export async function setCompanyLogo(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  publicId: string,
): Promise<CompanyView> {
  const stored = await confirmUpload(publicId, logoRule(companyId));
  const before = await CompanyModel.findByIdAndUpdate(
    companyId,
    { $set: { logo: { ...stored, alt: '' } } },
    { projection: { logo: 1 } },
  ).lean();
  if (!before) throw new NotFoundError('Company');
  if (before.logo && before.logo.publicId !== stored.publicId)
    await deleteImage(before.logo.publicId);
  await audit({
    companyId,
    actorId,
    action: 'company.logo_set',
    entity: 'company',
    entityId: companyId,
  });
  return getCompany(companyId);
}

export async function removeCompanyLogo(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
): Promise<CompanyView> {
  const before = await CompanyModel.findByIdAndUpdate(
    companyId,
    { $set: { logo: null } },
    { projection: { logo: 1 } },
  ).lean();
  if (!before) throw new NotFoundError('Company');
  if (before.logo) {
    await deleteImage(before.logo.publicId);
    await audit({
      companyId,
      actorId,
      action: 'company.logo_removed',
      entity: 'company',
      entityId: companyId,
    });
  }
  return getCompany(companyId);
}
