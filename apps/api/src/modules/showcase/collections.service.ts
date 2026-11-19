import {
  COLLECTION_DEFAULTS,
  COLLECTION_KEYS,
  type CollectionImageSlot,
  type CollectionKey,
  type CollectionLanguage,
  type CollectionView,
  type collectionInputSchema,
  type LocalizedText,
} from '@printbi/shared';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { NotFoundError } from '../../core/errors';
import { deleteImage, imageView, type StoredImage } from '../../core/media/cloudinary';
import { collectionImageRule, confirmUpload } from '../../core/media/uploads';
import { CompanyModel } from '../companies/company.model';
import { ProductModel } from '../products/product.model';

/**
 * Seasonal collections live inside the company document. Only edited ones are stored; the
 * others use their defaults and stay hidden. Texts left empty fall back to the defaults.
 */

export interface StoredCollectionImage extends StoredImage {
  _id: Types.ObjectId;
  alt?: string | null;
}

interface StoredBanner {
  desktop?: StoredCollectionImage | null;
  mobile?: StoredCollectionImage | null;
}

export interface StoredCollection {
  key: CollectionKey;
  active?: boolean | null;
  name?: Partial<LocalizedText> | null;
  title?: Partial<LocalizedText> | null;
  intro?: Partial<LocalizedText> | null;
  alt?: Partial<LocalizedText> | null;
  banners?: { pt?: StoredBanner | null; en?: StoredBanner | null } | null;
  header?: StoredCollectionImage | null;
}

/** A collection with every text and image resolved: defaults fill what was never edited. */
export interface ResolvedCollection {
  key: CollectionKey;
  slug: string;
  active: boolean;
  name: LocalizedText;
  title: LocalizedText;
  intro: LocalizedText;
  alt: LocalizedText;
  banners: Record<
    CollectionLanguage,
    { desktop: StoredCollectionImage | null; mobile: StoredCollectionImage | null }
  >;
  header: StoredCollectionImage | null;
}

const text = (stored: Partial<LocalizedText> | null | undefined, fallback: LocalizedText) => ({
  pt: stored?.pt || fallback.pt,
  en: stored?.en || fallback.en,
});

export function resolveCollection(
  key: CollectionKey,
  stored?: StoredCollection,
): ResolvedCollection {
  const defaults = COLLECTION_DEFAULTS[key];
  const banner = (b?: StoredBanner | null) => ({
    desktop: b?.desktop ?? null,
    mobile: b?.mobile ?? null,
  });
  return {
    key,
    slug: defaults.slug,
    active: stored?.active ?? false,
    name: text(stored?.name, defaults.name),
    title: text(stored?.title, defaults.title),
    intro: text(stored?.intro, defaults.intro),
    alt: { pt: stored?.alt?.pt ?? '', en: stored?.alt?.en ?? '' },
    banners: { pt: banner(stored?.banners?.pt), en: banner(stored?.banners?.en) },
    header: stored?.header ?? null,
  };
}

/** All four collections in their fixed order, resolved. */
export function resolveAll(stored: StoredCollection[] | null | undefined): ResolvedCollection[] {
  const byKey = new Map((stored ?? []).map((c) => [c.key, c]));
  return COLLECTION_KEYS.map((key) => resolveCollection(key, byKey.get(key)));
}

async function loadStored(companyId: Types.ObjectId): Promise<StoredCollection[]> {
  const company = await CompanyModel.findById(companyId, { collections: 1 }).lean();
  if (!company) throw new NotFoundError('Company');
  return (company.collections ?? []) as unknown as StoredCollection[];
}

const view = (c: ResolvedCollection, productCount: number): CollectionView => {
  const image = (i: StoredCollectionImage | null) => (i ? imageView(i) : null);
  return {
    key: c.key,
    slug: c.slug,
    active: c.active,
    name: c.name,
    title: c.title,
    intro: c.intro,
    banners: {
      pt: {
        desktop: image(c.banners.pt.desktop),
        mobile: image(c.banners.pt.mobile),
        alt: c.alt.pt,
      },
      en: {
        desktop: image(c.banners.en.desktop),
        mobile: image(c.banners.en.mobile),
        alt: c.alt.en,
      },
    },
    header: image(c.header),
    productCount,
  };
};

/** How many visible, active products belong to each collection. */
async function productCounts(companyId: Types.ObjectId): Promise<Map<string, number>> {
  const rows = await ProductModel.aggregate<{ _id: string; count: number }>([
    { $match: { companyId, 'showcase.visible': true, archivedAt: null } },
    { $unwind: '$showcase.collections' },
    { $group: { _id: '$showcase.collections', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.count]));
}

export async function listCollections(companyId: Types.ObjectId): Promise<CollectionView[]> {
  const [stored, counts] = await Promise.all([loadStored(companyId), productCounts(companyId)]);
  return resolveAll(stored).map((c) => view(c, counts.get(c.key) ?? 0));
}

async function getCollection(companyId: Types.ObjectId, key: CollectionKey) {
  const found = (await listCollections(companyId)).find((c) => c.key === key);
  if (!found) throw new NotFoundError('Collection');
  return found;
}

/** Makes sure the collection has a stored entry, so its fields can be set by path. */
async function ensureStored(companyId: Types.ObjectId, key: CollectionKey) {
  await CompanyModel.updateOne(
    { _id: companyId, 'collections.key': { $ne: key } },
    { $push: { collections: { key } } },
  );
}

export async function updateCollection(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  key: CollectionKey,
  input: z.output<typeof collectionInputSchema>,
): Promise<CollectionView> {
  await ensureStored(companyId, key);
  const result = await CompanyModel.updateOne(
    { _id: companyId, 'collections.key': key },
    {
      $set: {
        'collections.$.active': input.active,
        'collections.$.name': input.name,
        'collections.$.title': input.title,
        'collections.$.intro': input.intro,
        'collections.$.alt': input.alt,
      },
    },
  );
  if (result.matchedCount !== 1) throw new NotFoundError('Company');
  await audit({
    companyId,
    actorId,
    action: input.active ? 'collection.shown' : 'collection.updated',
    entity: 'company',
    entityId: companyId,
    reason: key,
  });
  return getCollection(companyId, key);
}

/** Where an image slot lives inside a stored collection. */
function slotPath(slot: CollectionImageSlot, lang: CollectionLanguage): string {
  if (slot === 'header') return 'header';
  return `banners.${lang}.${slot === 'banner-desktop' ? 'desktop' : 'mobile'}`;
}

function imageAt(collection: StoredCollection | undefined, path: string) {
  let value: unknown = collection;
  for (const part of path.split('.'))
    value = (value as Record<string, unknown> | undefined)?.[part];
  return (value as StoredCollectionImage | null | undefined) ?? null;
}

/** Puts an image in a slot (or clears it with null) and deletes the file it replaces. */
async function replaceImage(
  companyId: Types.ObjectId,
  key: CollectionKey,
  path: string,
  image: (StoredImage & { alt: string }) | null,
): Promise<void> {
  await ensureStored(companyId, key);
  const before = await CompanyModel.findOneAndUpdate(
    { _id: companyId, 'collections.key': key },
    { $set: { [`collections.$.${path}`]: image } },
    { projection: { collections: 1 } },
  ).lean();
  if (!before) throw new NotFoundError('Company');
  const previous = imageAt(
    (before.collections as unknown as StoredCollection[]).find((c) => c.key === key),
    path,
  );
  if (previous && previous.publicId !== image?.publicId) await deleteImage(previous.publicId);
}

export async function setCollectionImage(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  key: CollectionKey,
  slot: CollectionImageSlot,
  lang: CollectionLanguage,
  publicId: string,
): Promise<CollectionView> {
  const stored = await confirmUpload(publicId, collectionImageRule(companyId, key));
  await replaceImage(companyId, key, slotPath(slot, lang), { ...stored, alt: '' });
  await audit({
    companyId,
    actorId,
    action: 'collection.image_set',
    entity: 'company',
    entityId: companyId,
    reason: `${key} · ${slot} · ${lang}`,
  });
  return getCollection(companyId, key);
}

export async function removeCollectionImage(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  key: CollectionKey,
  slot: CollectionImageSlot,
  lang: CollectionLanguage,
): Promise<CollectionView> {
  await replaceImage(companyId, key, slotPath(slot, lang), null);
  await audit({
    companyId,
    actorId,
    action: 'collection.image_removed',
    entity: 'company',
    entityId: companyId,
    reason: `${key} · ${slot} · ${lang}`,
  });
  return getCollection(companyId, key);
}

export { loadStored as loadStoredCollections };
