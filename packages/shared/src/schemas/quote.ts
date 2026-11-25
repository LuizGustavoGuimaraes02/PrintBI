import { z } from 'zod';
import { currencySchema, nonNegativeDecimalSchema, objectIdSchema } from './common';

/**
 * Quotes. Amounts come in as decimal strings and leave as micro-units, like the rest of the app.
 * Totals are never trusted from the page: the server works them out again.
 */

export const QUOTE_STATUSES = ['draft', 'sent', 'approved', 'rejected', 'cancelled'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
/** What a list shows: the stored status, or "expired" for a draft/sent quote past its date. */
export type QuoteDisplayStatus = QuoteStatus | 'expired';

export const QUOTE_LANGUAGES = ['pt-BR', 'en'] as const;
export type QuoteLanguage = (typeof QUOTE_LANGUAGES)[number];

export const QUOTE_ACTIONS = ['send', 'approve', 'reject', 'cancel', 'reopen'] as const;
export type QuoteAction = (typeof QUOTE_ACTIONS)[number];

/** One component of a line's estimated cost, shown to the customer when the quote says so. */
export const BREAKDOWN_KINDS = [
  'filament',
  'material',
  'energy',
  'labor',
  'machine',
  'risk',
  'fees',
] as const;
export type BreakdownKind = (typeof BREAKDOWN_KINDS)[number];

const text = (max: number) => z.string().trim().max(max).default('');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');

export const quoteLineSchema = z.object({
  productId: objectIdSchema.nullable().default(null),
  calculationId: objectIdSchema.nullable().default(null),
  description: z.string().trim().min(1, 'Describe the item').max(500),
  quantity: nonNegativeDecimalSchema.refine((v) => v > 0, { message: 'More than zero' }),
  /** Shown after the quantity: "pieces", "h"... */
  unit: text(20),
  unitPrice: nonNegativeDecimalSchema,
  /** An amount taken off this line. */
  discount: nonNegativeDecimalSchema.default(0),
});

export const quoteTaxSchema = z.object({
  label: z.string().trim().min(1, 'Name the tax').max(40),
  percent: nonNegativeDecimalSchema.refine((v) => v <= 100_000_000, { message: 'At most 100%' }),
});

export const quoteCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Who is it for?').max(120),
  company: text(120),
  email: text(160),
  phone: text(40),
  address: text(300),
});

export const quoteInputSchema = z.object({
  title: text(160),
  language: z.enum(QUOTE_LANGUAGES),
  currency: currencySchema,
  issuedAt: isoDate,
  validUntil: isoDate.nullable().default(null),
  /** A registered customer, or details typed for this quote only. */
  customerId: objectIdSchema.nullable().default(null),
  customer: quoteCustomerSchema,
  lines: z.array(quoteLineSchema).min(1, 'Add at least one item').max(60),
  discount: nonNegativeDecimalSchema.default(0),
  delivery: nonNegativeDecimalSchema.default(0),
  taxes: z.array(quoteTaxSchema).max(6).default([]),
  /** Show each calculated line's components at their purchase cost, plus the added profit. */
  showBreakdown: z.boolean().default(false),
  leadTime: text(160),
  deliveryMethod: text(160),
  paymentTerms: text(1000),
  notes: text(2000),
  privateNotes: text(2000),
});
export type QuoteInput = z.output<typeof quoteInputSchema>;
export type QuoteInputForm = z.input<typeof quoteInputSchema>;

export const quoteActionSchema = z.object({
  action: z.enum(QUOTE_ACTIONS),
  note: text(300),
});

export const quoteFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum([...QUOTE_STATUSES, 'expired']).optional(),
  customerId: objectIdSchema.optional(),
});
