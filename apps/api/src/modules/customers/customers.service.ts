import type { CustomerView, customerFiltersSchema, customerInputSchema } from '@printbi/shared';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { NotFoundError } from '../../core/errors';
import { CustomerModel, type Customer } from './customer.model';

type CustomerRecord = Customer & { _id: Types.ObjectId; createdAt: Date };

const toView = (c: CustomerRecord): CustomerView => ({
  id: c._id.toString(),
  name: c.name,
  company: c.company ?? '',
  phone: c.phone ?? '',
  email: c.email ?? '',
  address: c.address ?? '',
  notes: c.notes ?? '',
  archived: Boolean(c.archivedAt),
  salesCount: 0,
  totalPurchased: [],
  createdAt: c.createdAt.toISOString(),
});

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listCustomers(
  companyId: Types.ObjectId,
  filters: z.output<typeof customerFiltersSchema>,
): Promise<CustomerView[]> {
  const query: Record<string, unknown> = {
    companyId,
    archivedAt: filters.archived ? { $ne: null } : null,
  };
  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), 'i');
    query.$or = [{ name: pattern }, { company: pattern }, { email: pattern }, { phone: pattern }];
  }
  const rows = await CustomerModel.find(query).sort({ name: 1 }).limit(500).lean();
  return (rows as CustomerRecord[]).map(toView);
}

export async function getCustomer(
  companyId: Types.ObjectId,
  id: Types.ObjectId,
): Promise<CustomerView> {
  const row = await CustomerModel.findOne({ _id: id, companyId }).lean();
  if (!row) throw new NotFoundError('Customer');
  return toView(row as CustomerRecord);
}

export async function createCustomer(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  input: z.output<typeof customerInputSchema>,
): Promise<CustomerView> {
  const customer = new CustomerModel({ ...input, companyId, createdBy: actorId });
  await customer.save();
  await audit({
    companyId,
    actorId,
    action: 'customer.created',
    entity: 'customer',
    entityId: customer._id,
  });
  return getCustomer(companyId, customer._id);
}

export async function updateCustomer(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
  input: z.output<typeof customerInputSchema>,
): Promise<CustomerView> {
  const result = await CustomerModel.updateOne(
    { _id: id, companyId },
    { $set: input },
    { runValidators: true },
  );
  if (result.matchedCount !== 1) throw new NotFoundError('Customer');
  await audit({ companyId, actorId, action: 'customer.updated', entity: 'customer', entityId: id });
  return getCustomer(companyId, id);
}

export async function setCustomerArchived(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
  archived: boolean,
  reason: string,
): Promise<CustomerView> {
  const result = await CustomerModel.updateOne(
    { _id: id, companyId },
    { $set: { archivedAt: archived ? new Date() : null } },
  );
  if (result.matchedCount !== 1) throw new NotFoundError('Customer');
  await audit({
    companyId,
    actorId,
    action: archived ? 'customer.archived' : 'customer.restored',
    entity: 'customer',
    entityId: id,
    reason,
  });
  return getCustomer(companyId, id);
}
