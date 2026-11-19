import { z } from 'zod';
import { objectIdSchema } from './common';

/** Image formats accepted for uploads, checked by Cloudinary and again by the API. */
export const PRODUCT_IMAGE_FORMATS = ['jpg', 'png', 'webp'] as const;
export const LOGO_FORMATS = ['jpg', 'png', 'webp', 'svg'] as const;
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const LOGO_MAX_BYTES = 1024 * 1024;
export const MAX_PRODUCT_IMAGES = 8;

export const UPLOAD_TARGETS = ['product', 'logo'] as const;
export type UploadTarget = (typeof UPLOAD_TARGETS)[number];

export const signUploadSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('product'), productId: objectIdSchema }),
  z.object({ target: z.literal('logo') }),
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
