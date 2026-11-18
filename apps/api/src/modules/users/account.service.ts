import { permissionsFor, type AccountView } from '@printbi/shared';
import type { Types } from 'mongoose';
import { UnauthorizedError } from '../../core/errors';
import { CompanyModel } from '../companies/company.model';
import { UserModel } from './user.model';

export type { AccountView };

/** What the web app needs after sign-in: who I am, my companies, and what I may do. */
export async function getAccount(
  userId: Types.ObjectId,
  activeCompanyId: Types.ObjectId | null,
): Promise<AccountView> {
  const user = await UserModel.findById(userId, {
    firstName: 1,
    lastName: 1,
    email: 1,
    memberships: 1,
  }).lean();
  if (!user) throw new UnauthorizedError();

  const companies = await CompanyModel.find(
    { _id: { $in: user.memberships.map((m) => m.companyId) } },
    { name: 1 },
  ).lean();
  const names = new Map(companies.map((c) => [c._id.toString(), c.name]));

  const active = activeCompanyId
    ? user.memberships.find((m) => m.companyId.equals(activeCompanyId))
    : undefined;

  return {
    user: {
      id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
    companies: user.memberships.map((m) => ({
      id: m.companyId.toString(),
      name: names.get(m.companyId.toString()) ?? '',
      role: m.role,
    })),
    activeCompany: active
      ? {
          id: active.companyId.toString(),
          name: names.get(active.companyId.toString()) ?? '',
          role: active.role,
          finance: active.role === 'admin' || active.finance,
          permissions: permissionsFor(active),
        }
      : null,
  };
}
