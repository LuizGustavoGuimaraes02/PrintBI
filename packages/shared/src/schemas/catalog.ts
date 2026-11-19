import { z } from 'zod';
import { HEX_COLOR } from '../inventory/colors';
import { nonNegativeDecimalSchema, objectIdSchema } from './common';
import { emailSchema } from './auth';
import { moneyInputSchema } from './settings';

const text = (max: number) => z.string().trim().max(max).default('');

/** Calm label colors that keep dark text readable; any hex is accepted too. */
export const LABEL_COLORS = [
  '#E2F1F3',
  '#FEF0E6',
  '#EDE7F6',
  '#E3F2E1',
  '#FDF3C4',
  '#FCE4EC',
  '#E8EEF2',
  '#F3E5D8',
] as const;

export const labelInputSchema = z.object({
  name: z.string().trim().min(1, 'Name the label').max(40),
  color: z.string().regex(HEX_COLOR, 'Use a color like #E2F1F3').default(LABEL_COLORS[0]),
});

export const updateLabelSchema = z
  .object({
    name: labelInputSchema.shape.name,
    color: labelInputSchema.shape.color,
    archived: z.boolean(),
  })
  .partial();

export const PRODUCT_TYPES = ['product', 'service'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const SALE_UNITS = ['unit', 'hour', 'service', 'custom'] as const;
export type SaleUnit = (typeof SALE_UNITS)[number];

const dimension = z.coerce
  .number()
  .positive('Must be greater than zero')
  .max(10_000)
  .nullable()
  .default(null);

export const productInputSchema = z
  .object({
    type: z.enum(PRODUCT_TYPES),
    name: z.string().trim().min(1, 'Name the product or service').max(120),
    description: text(2000),
    labelIds: z.array(objectIdSchema).max(20).default([]),
    /** Usual selling price; every quote and sale can still change it. */
    price: moneyInputSchema.nullable().default(null),
    /** Rough cost, entered by hand until a saved calculation provides it. */
    estimatedCost: moneyInputSchema.nullable().default(null),
    saleUnit: z.enum(SALE_UNITS).default('unit'),
    customUnit: text(20),
    /** Size and filament use of a typical piece; shown on the showcase and used by the calculator. */
    specs: z
      .object({
        widthMm: dimension,
        depthMm: dimension,
        heightMm: dimension,
        filamentGrams: nonNegativeDecimalSchema.nullable().default(null),
      })
      .default({ widthMm: null, depthMm: null, heightMm: null, filamentGrams: null }),
    notes: text(2000),
  })
  .refine((p) => p.saleUnit !== 'custom' || p.customUnit.length > 0, {
    message: 'Name the unit',
    path: ['customUnit'],
  });
export type ProductInput = z.input<typeof productInputSchema>;

export const archiveSchema = z.object({
  archived: z.boolean(),
  reason: z.string().trim().max(300).default(''),
});

export const productFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(PRODUCT_TYPES).optional(),
  labelId: objectIdSchema.optional(),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  company: text(120),
  /** Phone or WhatsApp, free format. */
  phone: text(40),
  email: z.union([emailSchema, z.literal('')]).default(''),
  address: text(300),
  notes: text(2000),
  /** Where the customer came from (WhatsApp, Referral, Instagram...). */
  sourceId: objectIdSchema.nullable().default(null),
  /** Optional detail, e.g. who referred them. */
  sourceDetail: text(120),
});
export type CustomerInput = z.input<typeof customerInputSchema>;

export const customerFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  /** A source id, or "none" for customers without one. */
  sourceId: z.union([objectIdSchema, z.literal('none')]).optional(),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/** Starting list of customer sources; each business renames, archives or adds its own. */
export const DEFAULT_CUSTOMER_SOURCES = ['WhatsApp', 'Referral', 'Instagram'] as const;

export const customerSourceInputSchema = z.object({
  name: z.string().trim().min(1, 'Name the source').max(40),
});

export const updateCustomerSourceSchema = z
  .object({ name: customerSourceInputSchema.shape.name, archived: z.boolean() })
  .partial();
