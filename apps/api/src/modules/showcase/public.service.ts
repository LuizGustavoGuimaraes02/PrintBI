import type {
  Money,
  PublicBusinessView,
  PublicImageView,
  PublicLabelView,
  PublicProductCardView,
  PublicProductView,
  PublicShowcaseView,
} from '@printbi/shared';
import type { Types } from 'mongoose';
import { NotFoundError } from '../../core/errors';
import { imageView } from '../../core/media/cloudinary';
import { CompanyModel } from '../companies/company.model';
import { ProductModel } from '../products/product.model';
import type { ImageRecord, ProductRecord } from '../products/products.service';

/**
 * The public showcase. Everything here is read by visitors without an account, so each view
 * is built from an allowlist: costs, notes, sales data and internal ids never leave this file.
 */

const NOT_FOUND = () => new NotFoundError('Showcase');

const publicImage = (image: ImageRecord): PublicImageView => {
  const { width, height, alt, urls } = imageView(image);
  return { width, height, alt, urls };
};

interface CompanyRecord {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  website?: string | null;
  social?: string | null;
  logo?: ImageRecord | null;
  labels?: { _id: Types.ObjectId; name: string; color?: string | null; archivedAt?: Date | null }[];
  showcase?: {
    title?: string | null;
    description?: string | null;
    language?: 'en' | 'pt-BR' | null;
    whatsapp?: string | null;
    messageTemplate?: string | null;
  } | null;
}

async function publishedCompany(slug: string): Promise<CompanyRecord> {
  const company = await CompanyModel.findOne(
    { slug, 'showcase.published': true },
    { name: 1, slug: 1, website: 1, social: 1, logo: 1, labels: 1, showcase: 1 },
  ).lean();
  if (!company) throw NOT_FOUND();
  return company as unknown as CompanyRecord;
}

function businessView(company: CompanyRecord): PublicBusinessView {
  return {
    name: company.name,
    slug: company.slug,
    title: company.showcase?.title ?? '',
    description: company.showcase?.description ?? '',
    language: company.showcase?.language ?? 'pt-BR',
    whatsapp: company.showcase?.whatsapp ?? '',
    messageTemplate: company.showcase?.messageTemplate ?? '',
    logo: company.logo ? publicImage(company.logo) : null,
    website: company.website ?? '',
    social: company.social ?? '',
  };
}

/** Active labels only: an archived label is an internal decision customers don't need. */
function labelLookup(company: CompanyRecord) {
  const labels = new Map<string, PublicLabelView>();
  for (const label of company.labels ?? []) {
    if (label.archivedAt) continue;
    labels.set(label._id.toString(), { name: label.name, color: label.color ?? '#E2F1F3' });
  }
  return (ids: Types.ObjectId[]) =>
    ids.flatMap((id) => {
      const label = labels.get(id.toString());
      return label ? [label] : [];
    });
}

const money = (m?: Money | null): Money | null =>
  m ? { amount: m.amount, currency: m.currency } : null;

function cardView(
  product: ProductRecord,
  labelsFor: (ids: Types.ObjectId[]) => PublicLabelView[],
): PublicProductCardView {
  const images = product.images ?? [];
  const cover = images[0];
  return {
    slug: product.showcase?.slug ?? '',
    type: product.type,
    name: product.name,
    description: product.description ?? '',
    labels: labelsFor(product.labelIds),
    badge: product.showcase?.badge ?? 'made_to_order',
    featured: product.showcase?.featured ?? false,
    price: product.showcase?.showPrice ? money(product.price) : null,
    saleUnit: product.saleUnit ?? 'unit',
    customUnit: product.customUnit ?? '',
    specs: {
      widthMm: product.specs?.widthMm ?? null,
      depthMm: product.specs?.depthMm ?? null,
      heightMm: product.specs?.heightMm ?? null,
      filamentGrams: product.specs?.filamentGrams ?? null,
    },
    cover: cover ? publicImage(cover) : null,
    imageCount: images.length,
  };
}

/** Only these product fields are read from the database for public pages. */
const PUBLIC_PRODUCT_FIELDS = {
  type: 1,
  name: 1,
  description: 1,
  labelIds: 1,
  price: 1,
  saleUnit: 1,
  customUnit: 1,
  specs: 1,
  images: 1,
  showcase: 1,
} as const;

const visible = (companyId: Types.ObjectId) => ({
  companyId,
  'showcase.visible': true,
  archivedAt: null,
});

export async function getPublicShowcase(slug: string): Promise<PublicShowcaseView> {
  const company = await publishedCompany(slug);
  const rows = (await ProductModel.find(visible(company._id), PUBLIC_PRODUCT_FIELDS)
    .sort({ 'showcase.order': 1, name: 1 })
    .limit(500)
    .lean()) as unknown as ProductRecord[];
  const labelsFor = labelLookup(company);
  const products = rows.filter((p) => p.showcase?.slug).map((p) => cardView(p, labelsFor));
  // The filter offers only labels that some visible product actually has.
  const used = new Map(products.flatMap((p) => p.labels).map((l) => [l.name, l]));
  return {
    business: businessView(company),
    labels: [...used.values()].sort((a, b) => a.name.localeCompare(b.name)),
    products,
  };
}

export async function getPublicProduct(
  slug: string,
  productSlug: string,
): Promise<PublicProductView> {
  const company = await publishedCompany(slug);
  const product = (await ProductModel.findOne(
    { ...visible(company._id), 'showcase.slug': productSlug },
    PUBLIC_PRODUCT_FIELDS,
  ).lean()) as unknown as ProductRecord | null;
  if (!product) throw new NotFoundError('Product');
  return {
    ...cardView(product, labelLookup(company)),
    images: (product.images ?? []).map(publicImage),
    business: businessView(company),
  };
}
