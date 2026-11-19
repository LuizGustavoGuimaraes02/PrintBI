import type { LabelView, labelInputSchema, updateLabelSchema } from '@printbi/shared';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import { CompanyModel } from '../companies/company.model';
import { ProductModel } from '../products/product.model';

interface LabelRecord {
  _id: Types.ObjectId;
  name: string;
  color?: string | null;
  archivedAt?: Date | null;
}

const sameName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

export async function loadLabels(companyId: Types.ObjectId): Promise<LabelRecord[]> {
  const company = await CompanyModel.findById(companyId, { labels: 1 }).lean();
  if (!company) throw new NotFoundError('Company');
  return (company.labels ?? []) as LabelRecord[];
}

export async function listLabels(companyId: Types.ObjectId): Promise<LabelView[]> {
  const [labels, counts] = await Promise.all([
    loadLabels(companyId),
    ProductModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { companyId, archivedAt: null } },
      { $unwind: '$labelIds' },
      { $group: { _id: '$labelIds', count: { $sum: 1 } } },
    ]),
  ]);
  const byLabel = new Map(counts.map((c) => [c._id.toString(), c.count]));
  return labels
    .map((l) => ({
      id: l._id.toString(),
      name: l.name,
      color: l.color ?? '#E2F1F3',
      archived: Boolean(l.archivedAt),
      productCount: byLabel.get(l._id.toString()) ?? 0,
    }))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
}

function assertUnique(labels: LabelRecord[], name: string, exceptId?: Types.ObjectId) {
  const clash = labels.find(
    (l) => !l.archivedAt && sameName(l.name, name) && !(exceptId && l._id.equals(exceptId)),
  );
  if (clash) throw new ConflictError(`A label named "${clash.name}" already exists`);
}

export async function createLabel(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  input: z.output<typeof labelInputSchema>,
): Promise<LabelView> {
  assertUnique(await loadLabels(companyId), input.name);
  const label = {
    _id: new Types.ObjectId(),
    name: input.name,
    color: input.color,
    archivedAt: null,
  };
  await CompanyModel.updateOne({ _id: companyId }, { $push: { labels: label } });
  await audit({
    companyId,
    actorId,
    action: 'label.created',
    entity: 'label',
    entityId: label._id,
  });
  return {
    id: label._id.toString(),
    name: label.name,
    color: label.color,
    archived: false,
    productCount: 0,
  };
}

export async function updateLabel(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  labelId: Types.ObjectId,
  input: z.output<typeof updateLabelSchema>,
): Promise<LabelView> {
  const labels = await loadLabels(companyId);
  const current = labels.find((l) => l._id.equals(labelId));
  if (!current) throw new NotFoundError('Label');
  const archived = input.archived ?? Boolean(current.archivedAt);
  const name = input.name ?? current.name;
  if (!archived) assertUnique(labels, name, labelId);

  await CompanyModel.updateOne(
    { _id: companyId, 'labels._id': labelId },
    {
      $set: {
        'labels.$.name': name,
        'labels.$.color': input.color ?? current.color,
        'labels.$.archivedAt': archived ? (current.archivedAt ?? new Date()) : null,
      },
    },
  );
  await audit({
    companyId,
    actorId,
    action: 'label.updated',
    entity: 'label',
    entityId: labelId,
    changes: input,
  });
  const view = (await listLabels(companyId)).find((l) => l.id === labelId.toString());
  if (!view) throw new NotFoundError('Label');
  return view;
}

/**
 * Products may only point at this company's active labels. Labels a product already
 * carries stay valid after being archived, so editing it does not force their removal.
 */
export async function assertUsableLabels(
  companyId: Types.ObjectId,
  labelIds: string[],
  current: Types.ObjectId[] = [],
): Promise<Types.ObjectId[]> {
  if (labelIds.length === 0) return [];
  const kept = new Set(current.map((id) => id.toString()));
  const active = new Set(
    (await loadLabels(companyId))
      .filter((l) => !l.archivedAt || kept.has(l._id.toString()))
      .map((l) => l._id.toString()),
  );
  const unknown = labelIds.filter((id) => !active.has(id));
  if (unknown.length > 0) {
    throw new ValidationError('Some fields are invalid', [
      { path: 'labelIds', message: 'Choose active labels' },
    ]);
  }
  return [...new Set(labelIds)].map((id) => new Types.ObjectId(id));
}
