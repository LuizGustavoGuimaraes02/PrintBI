import {
  DEFAULT_CUSTOMER_SOURCES,
  type CustomerSourceView,
  type customerSourceInputSchema,
  type updateCustomerSourceSchema,
} from '@printbi/shared';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import { CompanyModel } from '../companies/company.model';
import { CustomerModel } from '../customers/customer.model';

export interface SourceRecord {
  _id: Types.ObjectId;
  name: string;
  archivedAt?: Date | null;
}

const sameName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

/**
 * The company's sources. A business that has never had any (including those created
 * before sources existed) gets the default list once; the filter makes that atomic.
 */
export async function loadSources(companyId: Types.ObjectId): Promise<SourceRecord[]> {
  const company = await CompanyModel.findById(companyId, { customerSources: 1 }).lean();
  if (!company) throw new NotFoundError('Company');
  if (company.customerSources && company.customerSources.length > 0) {
    return company.customerSources as SourceRecord[];
  }
  await CompanyModel.updateOne(
    {
      _id: companyId,
      $or: [{ customerSources: { $exists: false } }, { customerSources: { $size: 0 } }],
    },
    {
      $set: {
        customerSources: DEFAULT_CUSTOMER_SOURCES.map((name) => ({
          _id: new Types.ObjectId(),
          name,
          archivedAt: null,
        })),
      },
    },
  );
  const seeded = await CompanyModel.findById(companyId, { customerSources: 1 }).lean();
  return (seeded?.customerSources ?? []) as SourceRecord[];
}

export async function listSources(companyId: Types.ObjectId): Promise<CustomerSourceView[]> {
  const [sources, counts] = await Promise.all([
    loadSources(companyId),
    CustomerModel.aggregate<{ _id: Types.ObjectId | null; count: number }>([
      { $match: { companyId, archivedAt: null } },
      { $group: { _id: '$sourceId', count: { $sum: 1 } } },
    ]),
  ]);
  const bySource = new Map(counts.map((c) => [String(c._id), c.count]));
  return sources
    .map((s) => ({
      id: s._id.toString(),
      name: s.name,
      archived: Boolean(s.archivedAt),
      customerCount: bySource.get(s._id.toString()) ?? 0,
    }))
    .sort((a, b) => Number(a.archived) - Number(b.archived));
}

function assertUnique(sources: SourceRecord[], name: string, exceptId?: Types.ObjectId) {
  const clash = sources.find(
    (s) => !s.archivedAt && sameName(s.name, name) && !(exceptId && s._id.equals(exceptId)),
  );
  if (clash) throw new ConflictError(`A source named "${clash.name}" already exists`);
}

export async function createSource(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  input: z.output<typeof customerSourceInputSchema>,
): Promise<CustomerSourceView> {
  assertUnique(await loadSources(companyId), input.name);
  const source = { _id: new Types.ObjectId(), name: input.name, archivedAt: null };
  await CompanyModel.updateOne({ _id: companyId }, { $push: { customerSources: source } });
  await audit({
    companyId,
    actorId,
    action: 'customer_source.created',
    entity: 'customer_source',
    entityId: source._id,
  });
  return { id: source._id.toString(), name: source.name, archived: false, customerCount: 0 };
}

export async function updateSource(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  sourceId: Types.ObjectId,
  input: z.output<typeof updateCustomerSourceSchema>,
): Promise<CustomerSourceView> {
  const sources = await loadSources(companyId);
  const current = sources.find((s) => s._id.equals(sourceId));
  if (!current) throw new NotFoundError('Source');
  const archived = input.archived ?? Boolean(current.archivedAt);
  const name = input.name ?? current.name;
  if (!archived) assertUnique(sources, name, sourceId);
  await CompanyModel.updateOne(
    { _id: companyId, 'customerSources._id': sourceId },
    {
      $set: {
        'customerSources.$.name': name,
        'customerSources.$.archivedAt': archived ? (current.archivedAt ?? new Date()) : null,
      },
    },
  );
  await audit({
    companyId,
    actorId,
    action: 'customer_source.updated',
    entity: 'customer_source',
    entityId: sourceId,
    changes: input,
  });
  const view = (await listSources(companyId)).find((s) => s.id === sourceId.toString());
  if (!view) throw new NotFoundError('Source');
  return view;
}

/** A customer may point at an active source, or keep the archived one it already has. */
export async function assertUsableSource(
  companyId: Types.ObjectId,
  sourceId: string | null,
  current: Types.ObjectId | null = null,
): Promise<Types.ObjectId | null> {
  if (!sourceId) return null;
  const source = (await loadSources(companyId)).find((s) => s._id.toString() === sourceId);
  if (!source || (source.archivedAt && !current?.equals(source._id))) {
    throw new ValidationError('Some fields are invalid', [
      { path: 'sourceId', message: 'Choose an active source' },
    ]);
  }
  return source._id;
}
