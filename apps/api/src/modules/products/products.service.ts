import {
  MAX_PRODUCT_IMAGES,
  slugify,
  type Money,
  type ProductView,
  type productFiltersSchema,
  type productInputSchema,
  type productShowcaseSchema,
  type updateImagesSchema,
} from '@printbi/shared';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { ConflictError, NotFoundError } from '../../core/errors';
import { deleteImage, imageView, type StoredImage } from '../../core/media/cloudinary';
import { confirmUpload, productImageRule } from '../../core/media/uploads';
import { assertUsableLabels, loadLabels } from '../labels/labels.service';
import { ProductModel } from './product.model';

type ProductInput = z.output<typeof productInputSchema>;

export interface ImageRecord extends StoredImage {
  _id: Types.ObjectId;
  alt?: string | null;
}

export interface ProductRecord {
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
  images?: ImageRecord[] | null;
  showcase?: {
    visible?: boolean | null;
    badge?: ProductView['showcase']['badge'] | null;
    showPrice?: boolean | null;
    featured?: boolean | null;
    order?: number | null;
    slug?: string | null;
  } | null;
  archivedAt?: Date | null;
  updatedAt: Date;
}

const money = (m?: Money | null): Money | null =>
  m ? { amount: m.amount, currency: m.currency } : null;

export async function toViews(
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
    images: (p.images ?? []).map(imageView),
    showcase: {
      visible: p.showcase?.visible ?? false,
      badge: p.showcase?.badge ?? 'made_to_order',
      showPrice: p.showcase?.showPrice ?? false,
      featured: p.showcase?.featured ?? false,
      order: p.showcase?.order ?? 0,
      slug: p.showcase?.slug ?? null,
    },
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

// ---- Photos -------------------------------------------------------------------------------

/** Links an uploaded photo to the product, after checking what Cloudinary stored. */
export async function addProductImage(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
  publicId: string,
  finance: boolean,
): Promise<ProductView> {
  const exists = await ProductModel.exists({ _id: id, companyId });
  if (!exists) throw new NotFoundError('Product');
  const stored = await confirmUpload(publicId, productImageRule(companyId, id));
  // The size check sits in the filter, so two uploads at once can't pass the limit.
  const result = await ProductModel.updateOne(
    {
      _id: id,
      companyId,
      [`images.${MAX_PRODUCT_IMAGES - 1}`]: { $exists: false },
      'images.publicId': { $ne: stored.publicId },
    },
    { $push: { images: { ...stored, alt: '' } } },
  );
  if (result.modifiedCount !== 1) {
    await deleteImage(stored.publicId);
    throw new ConflictError(`A product can have up to ${MAX_PRODUCT_IMAGES} photos`);
  }
  await audit({
    companyId,
    actorId,
    action: 'product.image_added',
    entity: 'product',
    entityId: id,
  });
  return getProduct(companyId, id, finance);
}

/** New photo order (the first is the cover) and alt texts. The set of photos can't change here. */
export async function updateProductImages(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
  input: z.output<typeof updateImagesSchema>,
  finance: boolean,
): Promise<ProductView> {
  const product = (await ProductModel.findOne(
    { _id: id, companyId },
    { images: 1 },
  ).lean()) as unknown as Pick<ProductRecord, 'images'> | null;
  if (!product) throw new NotFoundError('Product');
  const current = new Map((product.images ?? []).map((image) => [image._id.toString(), image]));
  const ids = new Set(input.images.map((image) => image.id));
  if (ids.size !== input.images.length || ids.size !== current.size) {
    throw new ConflictError('The photos changed meanwhile. Reload and try again.');
  }
  const images = input.images.map(({ id: imageId, alt }) => {
    const image = current.get(imageId);
    if (!image) throw new ConflictError('The photos changed meanwhile. Reload and try again.');
    return { ...image, alt };
  });
  // Saved only if nobody added or removed a photo since it was read.
  const result = await ProductModel.updateOne(
    { _id: id, companyId, images: { $size: current.size } },
    { $set: { images } },
  );
  if (result.matchedCount !== 1) {
    throw new ConflictError('The photos changed meanwhile. Reload and try again.');
  }
  await audit({
    companyId,
    actorId,
    action: 'product.images_updated',
    entity: 'product',
    entityId: id,
  });
  return getProduct(companyId, id, finance);
}

/** Unlinks a photo, then deletes the file on Cloudinary. */
export async function removeProductImage(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
  imageId: Types.ObjectId,
  finance: boolean,
): Promise<ProductView> {
  const before = (await ProductModel.findOneAndUpdate(
    { _id: id, companyId, 'images._id': imageId },
    { $pull: { images: { _id: imageId } } },
    { projection: { images: 1 } },
  ).lean()) as unknown as Pick<ProductRecord, 'images'> | null;
  const removed = before?.images?.find((image) => image._id.equals(imageId));
  if (!removed) throw new NotFoundError('Photo');
  await deleteImage(removed.publicId);
  await audit({
    companyId,
    actorId,
    action: 'product.image_removed',
    entity: 'product',
    entityId: id,
  });
  return getProduct(companyId, id, finance);
}

// ---- Showcase -----------------------------------------------------------------------------

const escapeSlug = (value: string) => value.replace(/[-]/g, '\\-');

/** The name as a link, unique within the company: dragon-keychain, dragon-keychain-2... */
async function uniqueProductSlug(companyId: Types.ObjectId, name: string): Promise<string> {
  const base = slugify(name) || 'item';
  const taken = new Set(
    (
      await ProductModel.find(
        { companyId, 'showcase.slug': new RegExp(`^${escapeSlug(base)}(-\\d+)?$`) },
        { showcase: 1 },
      ).lean()
    ).map((p) => p.showcase?.slug),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * How a product shows on the public showcase. Showing it for the first time gives it a link
 * (kept even if the product is renamed) and puts it at the end of the showcase order.
 */
export async function setProductShowcase(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
  input: z.output<typeof productShowcaseSchema>,
  finance: boolean,
): Promise<ProductView> {
  const product = (await ProductModel.findOne(
    { _id: id, companyId },
    { name: 1, showcase: 1, archivedAt: 1 },
  ).lean()) as unknown as Pick<ProductRecord, 'name' | 'showcase' | 'archivedAt'> | null;
  if (!product) throw new NotFoundError('Product');
  if (input.visible && product.archivedAt) {
    throw new ConflictError('Restore this product before showing it on the showcase');
  }
  const set: Record<string, unknown> = {
    'showcase.visible': input.visible,
    'showcase.badge': input.badge,
    'showcase.showPrice': input.showPrice,
    'showcase.featured': input.featured,
  };
  if (input.visible && !product.showcase?.slug) {
    set['showcase.slug'] = await uniqueProductSlug(companyId, product.name);
  }
  if (input.visible && !product.showcase?.visible) {
    const last = await ProductModel.findOne(
      { companyId, 'showcase.visible': true },
      { showcase: 1 },
    )
      .sort({ 'showcase.order': -1 })
      .lean();
    set['showcase.order'] = (last?.showcase?.order ?? 0) + 1;
  }
  await ProductModel.updateOne({ _id: id, companyId }, { $set: set });
  await audit({
    companyId,
    actorId,
    action: input.visible ? 'product.showcase_shown' : 'product.showcase_hidden',
    entity: 'product',
    entityId: id,
  });
  return getProduct(companyId, id, finance);
}

/** Products on the showcase in display order, for the admin's ordering list. */
export async function listShowcaseProducts(
  companyId: Types.ObjectId,
  finance: boolean,
): Promise<ProductView[]> {
  const rows = (await ProductModel.find({ companyId, 'showcase.visible': true, archivedAt: null })
    .sort({ 'showcase.order': 1, name: 1 })
    .limit(500)
    .lean()) as unknown as ProductRecord[];
  return toViews(companyId, rows, finance);
}

/** Saves the showcase order: the products listed first come first. */
export async function setShowcaseOrder(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  productIds: Types.ObjectId[],
  finance: boolean,
): Promise<ProductView[]> {
  if (productIds.length > 0) {
    await ProductModel.bulkWrite(
      productIds.map((productId, index) => ({
        updateOne: {
          filter: { _id: productId, companyId },
          update: { $set: { 'showcase.order': index + 1 } },
        },
      })),
    );
  }
  await audit({
    companyId,
    actorId,
    action: 'showcase.reordered',
    entity: 'company',
    entityId: companyId,
  });
  return listShowcaseProducts(companyId, finance);
}

/**
 * Deletes a product or service entered by mistake, and its photos on Cloudinary.
 * (Once quotes and sales exist, products they use are archived instead.)
 */
export async function deleteProduct(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
): Promise<void> {
  const product = (await ProductModel.findOneAndDelete(
    { _id: id, companyId },
    { projection: { name: 1, images: 1 } },
  ).lean()) as unknown as Pick<ProductRecord, 'name' | 'images'> | null;
  if (!product) throw new NotFoundError('Product');
  await Promise.all((product.images ?? []).map((image) => deleteImage(image.publicId)));
  await audit({
    companyId,
    actorId,
    action: 'product.deleted',
    entity: 'product',
    entityId: id,
    reason: product.name,
  });
}
