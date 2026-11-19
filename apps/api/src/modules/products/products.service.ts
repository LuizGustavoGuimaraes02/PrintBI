import type { Money, ProductView, productFiltersSchema, productInputSchema } from '@printbi/shared';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { NotFoundError } from '../../core/errors';
import { assertUsableLabels, loadLabels } from '../labels/labels.service';
import { ProductModel } from './product.model';

type ProductInput = z.output<typeof productInputSchema>;

interface ProductRecord {
  _id: Types.ObjectId;
  type: ProductView['type'];
  name: string;
  description?: string | null;
  labelIds: Types.ObjectId[];
  price?: Money | null;
  estimatedCost?: Money | null;
  saleUnit?: ProductView['saleUnit'] | null;
  customUnit?: string | null;
  specs?: {
    widthMm?: number | null;
    depthMm?: number | null;
    heightMm?: number | null;
    filamentGrams?: number | null;
  } | null;
  notes?: string | null;
  archivedAt?: Date | null;
  updatedAt: Date;
}

const money = (m?: Money | null): Money | null =>
  m ? { amount: m.amount, currency: m.currency } : null;

async function toViews(
  companyId: Types.ObjectId,
  rows: ProductRecord[],
  finance: boolean,
): Promise<ProductView[]> {
  const labels = new Map((await loadLabels(companyId)).map((l) => [l._id.toString(), l]));
  return rows.map((p) => ({
    id: p._id.toString(),
    type: p.type,
    name: p.name,
    description: p.description ?? '',
    labels: p.labelIds.flatMap((id) => {
      const label = labels.get(id.toString());
      return label
        ? [{ id: label._id.toString(), name: label.name, color: label.color ?? '#E2F1F3' }]
        : [];
    }),
    price: money(p.price),
    estimatedCost: finance ? money(p.estimatedCost) : null,
    saleUnit: p.saleUnit ?? 'unit',
    customUnit: p.customUnit ?? '',
    specs: {
      widthMm: p.specs?.widthMm ?? null,
      depthMm: p.specs?.depthMm ?? null,
      heightMm: p.specs?.heightMm ?? null,
      filamentGrams: p.specs?.filamentGrams ?? null,
    },
    notes: p.notes ?? '',
    archived: Boolean(p.archivedAt),
    soldQuantity: 0,
    updatedAt: p.updatedAt.toISOString(),
  }));
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listProducts(
  companyId: Types.ObjectId,
  filters: z.output<typeof productFiltersSchema>,
  finance: boolean,
): Promise<ProductView[]> {
  const query: Record<string, unknown> = {
    companyId,
    archivedAt: filters.archived ? { $ne: null } : null,
  };
  if (filters.type) query.type = filters.type;
  if (filters.labelId) query.labelIds = filters.labelId;
  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), 'i');
    query.$or = [{ name: pattern }, { description: pattern }];
  }
  const rows = (await ProductModel.find(query)
    .sort({ name: 1 })
    .limit(500)
    .lean()) as unknown as ProductRecord[];
  return toViews(companyId, rows, finance);
}

export async function getProduct(
  companyId: Types.ObjectId,
  id: Types.ObjectId,
  finance: boolean,
): Promise<ProductView> {
  const row = (await ProductModel.findOne({
    _id: id,
    companyId,
  }).lean()) as unknown as ProductRecord | null;
  if (!row) throw new NotFoundError('Product');
  const [view] = await toViews(companyId, [row], finance);
  return view as ProductView;
}

/** Members without financial access cannot see the estimated cost, so they never overwrite it. */
async function fields(
  companyId: Types.ObjectId,
  input: ProductInput,
  finance: boolean,
  currentLabels: Types.ObjectId[] = [],
) {
  const { estimatedCost, labelIds, ...rest } = input;
  return {
    ...rest,
    labelIds: await assertUsableLabels(companyId, labelIds, currentLabels),
    ...(finance && { estimatedCost }),
    customUnit: input.saleUnit === 'custom' ? input.customUnit : '',
  };
}

export async function createProduct(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  input: ProductInput,
  finance: boolean,
): Promise<ProductView> {
  const product = new ProductModel({
    ...(await fields(companyId, input, finance)),
    companyId,
    createdBy: actorId,
  });
  await product.save();
  await audit({
    companyId,
    actorId,
    action: 'product.created',
    entity: 'product',
    entityId: product._id,
  });
  return getProduct(companyId, product._id, finance);
}

export async function updateProduct(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
  input: ProductInput,
  finance: boolean,
): Promise<ProductView> {
  const current = await ProductModel.findOne({ _id: id, companyId }, { labelIds: 1 }).lean();
  if (!current) throw new NotFoundError('Product');
  await ProductModel.updateOne(
    { _id: id, companyId },
    { $set: await fields(companyId, input, finance, current.labelIds) },
    { runValidators: true },
  );
  await audit({ companyId, actorId, action: 'product.updated', entity: 'product', entityId: id });
  return getProduct(companyId, id, finance);
}

export async function setProductArchived(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
  archived: boolean,
  reason: string,
  finance: boolean,
): Promise<ProductView> {
  const result = await ProductModel.updateOne(
    { _id: id, companyId },
    { $set: { archivedAt: archived ? new Date() : null } },
  );
  if (result.matchedCount !== 1) throw new NotFoundError('Product');
  await audit({
    companyId,
    actorId,
    action: archived ? 'product.archived' : 'product.restored',
    entity: 'product',
    entityId: id,
    reason,
  });
  return getProduct(companyId, id, finance);
}
