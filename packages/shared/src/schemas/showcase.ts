import { z } from 'zod';
import { objectIdSchema } from './common';

/** The four seasonal collections. Each has its own theme; all start hidden. */
export const COLLECTION_KEYS = ['valentines', 'easter', 'halloween', 'christmas'] as const;
export type CollectionKey = (typeof COLLECTION_KEYS)[number];

/** Image formats accepted for uploads, checked by Cloudinary and again by the API. */
export const PRODUCT_IMAGE_FORMATS = ['jpg', 'png', 'webp'] as const;
export const LOGO_FORMATS = ['jpg', 'png', 'webp', 'svg'] as const;
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const LOGO_MAX_BYTES = 1024 * 1024;
export const MAX_PRODUCT_IMAGES = 8;

export const UPLOAD_TARGETS = ['product', 'logo', 'collection'] as const;
export type UploadTarget = (typeof UPLOAD_TARGETS)[number];

export const signUploadSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('product'), productId: objectIdSchema }),
  z.object({ target: z.literal('logo') }),
  z.object({ target: z.literal('collection'), key: z.enum(COLLECTION_KEYS) }),
]);
export type SignUploadInput = z.input<typeof signUploadSchema>;

/** After the browser uploads to Cloudinary, it registers the image by the id the API signed. */
export const registerImageSchema = z.object({
  publicId: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .regex(/^[\w/-]+$/, 'Invalid image id'),
});

/** New order of a product's photos (the first is the cover) with their alt text. */
export const updateImagesSchema = z.object({
  images: z
    .array(z.object({ id: objectIdSchema, alt: z.string().trim().max(200).default('') }))
    .max(MAX_PRODUCT_IMAGES),
});

export const SHOWCASE_BADGES = ['ready', 'made_to_order'] as const;
export type ShowcaseBadge = (typeof SHOWCASE_BADGES)[number];

/** How one product appears on the public showcase. Admin only. */
export const productShowcaseSchema = z.object({
  visible: z.boolean(),
  badge: z.enum(SHOWCASE_BADGES).default('made_to_order'),
  /** Show the usual price as "From ..." on the showcase. */
  showPrice: z.boolean().default(false),
  featured: z.boolean().default(false),
  /** Seasonal collections this product also appears in. */
  collections: z
    .array(z.enum(COLLECTION_KEYS))
    .max(4)
    .default([])
    .transform((keys) => [...new Set(keys)]),
});
export type ProductShowcaseInput = z.input<typeof productShowcaseSchema>;

export const showcaseOrderSchema = z.object({
  productIds: z.array(objectIdSchema).max(500),
});

export const SHOWCASE_LANGUAGES = ['en', 'pt-BR'] as const;
export type ShowcaseLanguage = (typeof SHOWCASE_LANGUAGES)[number];

/** Lowercase letters, digits and single hyphens: the part after /s/ in the public link. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const showcaseSettingsSchema = z.object({
  /** While false the public link answers "not found". */
  published: z.boolean(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Use at least 3 characters')
    .max(60)
    .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and hyphens'),
  title: z.string().trim().max(80).default(''),
  description: z.string().trim().max(500).default(''),
  language: z.enum(SHOWCASE_LANGUAGES).default('pt-BR'),
  /** WhatsApp number with country code; only digits are kept for the link. */
  whatsapp: z
    .string()
    .trim()
    .max(30)
    .refine(
      (v) => v === '' || v.replace(/\D/g, '').length >= 8,
      'Enter the number with its country code',
    )
    .default(''),
  /** Message the WhatsApp button starts with; {product} becomes the product name. */
  messageTemplate: z.string().trim().max(300).default(''),
});
export type ShowcaseSettingsInput = z.input<typeof showcaseSettingsSchema>;

export const DEFAULT_WHATSAPP_MESSAGE: Record<ShowcaseLanguage, string> = {
  'pt-BR': 'Oi, tudo bem? Tenho interesse em saber mais detalhes sobre o produto {product}.',
  en: "Hi! I'd like to know more about {product}.",
};

/** Lowercase, accent-free, hyphenated version of a name for links. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** The WhatsApp link for a product: the business number plus the filled-in message. */
export function whatsappProductLink(
  whatsapp: string,
  template: string,
  language: ShowcaseLanguage,
  productName: string,
): string | null {
  const digits = whatsapp.replace(/\D/g, '');
  if (digits.length < 8) return null;
  const message = (template || DEFAULT_WHATSAPP_MESSAGE[language]).replace(
    /\{(product|produto)\}/g,
    productName,
  );
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// ---- Seasonal collections ------------------------------------------------------------------

/** Collection texts come in Portuguese and English; an empty English text falls back to PT. */
export const COLLECTION_LANGUAGES = ['pt', 'en'] as const;
export type CollectionLanguage = (typeof COLLECTION_LANGUAGES)[number];
export interface LocalizedText {
  pt: string;
  en: string;
}

/** The showcase language as a collection text key. */
export const collectionLanguage = (language: ShowcaseLanguage): CollectionLanguage =>
  language === 'en' ? 'en' : 'pt';

/** Text in the visitor's language, or Portuguese when the English one was left empty. */
export const localized = (text: LocalizedText, language: ShowcaseLanguage): string =>
  (language === 'en' ? text.en : text.pt) || text.pt;

export const COLLECTION_DEFAULTS: Record<
  CollectionKey,
  { slug: string; name: LocalizedText; title: LocalizedText; intro: LocalizedText }
> = {
  valentines: {
    slug: 'dia-dos-namorados',
    name: { pt: 'Dia dos Namorados', en: 'Valentine’s Day' },
    title: { pt: 'Feito com carinho, camada por camada', en: 'Made with love, layer by layer' },
    intro: {
      pt: 'Presentes impressos sob medida: com nome, data ou a frase de vocês dois.',
      en: 'Gifts printed just for you two: with your names, a date or your own phrase.',
    },
  },
  easter: {
    slug: 'pascoa',
    name: { pt: 'Páscoa', en: 'Easter' },
    title: { pt: 'Uma Páscoa impressa com cor', en: 'A colorful printed Easter' },
    intro: {
      pt: 'Ovos decorados, coelhos articulados e cestas para encher de chocolate.',
      en: 'Decorated eggs, articulated bunnies and baskets to fill with chocolate.',
    },
  },
  halloween: {
    slug: 'halloween',
    name: { pt: 'Halloween', en: 'Halloween' },
    title: { pt: 'Noite das abóboras', en: 'Pumpkin night' },
    intro: {
      pt: 'Luminárias que acendem, morcegos articulados e decoração para o dia 31.',
      en: 'Lamps that light up, articulated bats and decor for the 31st.',
    },
  },
  christmas: {
    slug: 'natal',
    name: { pt: 'Natal', en: 'Christmas' },
    title: { pt: 'Natal na impressora', en: 'Christmas off the printer' },
    intro: {
      pt: 'Enfeites, presentes e peças personalizadas, impressas camada por camada.',
      en: 'Ornaments, gifts and personalized pieces, printed layer by layer.',
    },
  },
};

export const COLLECTION_IMAGE_FORMATS = ['jpg', 'webp'] as const;
export const COLLECTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Banner for the main showcase (desktop 1920 × 640, mobile 1080 × 1350) and the page header. */
export const COLLECTION_IMAGE_SLOTS = ['banner-desktop', 'banner-mobile', 'header'] as const;
export type CollectionImageSlot = (typeof COLLECTION_IMAGE_SLOTS)[number];

const localizedInput = (max: number) =>
  z.object({
    pt: z.string().trim().max(max).default(''),
    en: z.string().trim().max(max).default(''),
  });

/** Admin edits of one collection. Empty texts use the collection's default wording. */
export const collectionInputSchema = z.object({
  active: z.boolean(),
  name: localizedInput(60),
  title: localizedInput(90),
  intro: localizedInput(300),
  /** Describes the banner for screen readers, per language. */
  alt: localizedInput(200),
});
export type CollectionInput = z.input<typeof collectionInputSchema>;

export const collectionImageSchema = z.object({
  slot: z.enum(COLLECTION_IMAGE_SLOTS),
  /** Banners exist per language; the header is shared (sent as "pt"). */
  lang: z.enum(COLLECTION_LANGUAGES).default('pt'),
  publicId: registerImageSchema.shape.publicId,
});

export const collectionImageQuerySchema = collectionImageSchema.omit({ publicId: true });
