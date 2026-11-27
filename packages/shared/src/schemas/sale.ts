import { z } from 'zod';
import { currencySchema, decimalSchema, nonNegativeDecimalSchema, objectIdSchema } from './common';
import { PAYMENT_METHODS } from './inventory';

/**
 * Sales: what was sold, what was received and what it cost. Payment and production are
 * separate: a sale can be delivered and unpaid. Amounts come in as decimal strings and leave
 * as micro-units; totals are always worked out again on the server.
 */

/** Production as the customer sees it. A sale linked to an order follows that order. */
export const SALE_PRODUCTION = ['to_start', 'in_production', 'ready', 'delivered'] as const;
export type SaleProduction = (typeof SALE_PRODUCTION)[number];
/** What a list shows: the production, or "cancelled" for a cancelled sale or order. */
export type SaleProductionView = SaleProduction | 'cancelled';

export const SALE_PAYMENT = ['unpaid', 'partial', 'paid'] as const;
export type SalePayment = (typeof SALE_PAYMENT)[number];

export const SALE_CUSTOMER_KINDS = ['customer', 'name', 'unknown'] as const;
export type SaleCustomerKind = (typeof SALE_CUSTOMER_KINDS)[number];

const text = (max: number) => z.string().trim().max(max).default('');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');
const positiveDecimal = decimalSchema.refine((v) => v > 0, { message: 'More than zero' });

export const saleLineSchema = z.object({
  /** A catalog product or service; its labels are copied onto the line when saved. */
  productId: objectIdSchema.nullable().default(null),
  description: z.string().trim().min(1, 'Describe the item').max(500),
  quantity: positiveDecimal,
  unitPrice: nonNegativeDecimalSchema,
  /** An amount taken off this line. */
  discount: nonNegativeDecimalSchema.default(0),
  /** What making this line was expected to cost (all units), from a calculation or by hand. */
  estimatedCost: nonNegativeDecimalSchema.nullable().default(null),
});

/** A cost the business paid for this sale: shipping it paid, a platform fee, labor… */
export const saleCostSchema = z.object({
  label: z.string().trim().min(1, 'Name the cost').max(60),
  amount: positiveDecimal,
});

export const saleReceiptSchema = z.object({
  /** In the sale's currency. */
  amount: positiveDecimal,
  receivedAt: isoDate,
  method: z.enum(PAYMENT_METHODS),
  note: text(200),
});

export const saleCustomerSchema = z
  .object({
    kind: z.enum(SALE_CUSTOMER_KINDS),
    customerId: objectIdSchema.nullable().default(null),
    /** A name typed for this sale only (kind "name"). */
    name: text(120),
  })
  .superRefine((c, ctx) => {
    if (c.kind === 'customer' && !c.customerId) {
      ctx.addIssue({ code: 'custom', message: 'Choose a customer', path: ['customerId'] });
    }
    if (c.kind === 'name' && !c.name) {
      ctx.addIssue({ code: 'custom', message: 'Who bought it?', path: ['name'] });
    }
  });

export const saleInputSchema = z.object({
  saleDate: isoDate,
  customer: saleCustomerSchema,
  /** Where the sale came from (Instagram, referral…), from the business's customer sources. */
  sourceId: objectIdSchema.nullable().default(null),
  currency: currencySchema,
  lines: z.array(saleLineSchema).min(1, 'Add at least one item').max(60),
  /** Taken off the whole sale. */
  discount: nonNegativeDecimalSchema.default(0),
  /** Delivery charged to the customer. */
  delivery: nonNegativeDecimalSchema.default(0),
  costs: z.array(saleCostSchema).max(12).default([]),
  /** Production for a sale without an order; a linked order decides it instead. */
  production: z.enum(SALE_PRODUCTION).default('to_start'),
  notes: text(2000),
  /** Only when creating: where it comes from. Each order and each quote makes one sale. */
  quoteId: objectIdSchema.nullable().default(null),
  orderId: objectIdSchema.nullable().default(null),
  /** Money already received when the sale is registered (a deposit, or paid in full). */
  receipts: z.array(saleReceiptSchema).max(20).default([]),
});
export type SaleInput = z.output<typeof saleInputSchema>;
export type SaleInputForm = z.input<typeof saleInputSchema>;

export const saleCancelSchema = z.object({
  reason: z.string().trim().min(1, 'Say why it is cancelled').max(300),
});

const flag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const saleFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  customerId: objectIdSchema.optional(),
  productId: objectIdSchema.optional(),
  payment: z.enum(SALE_PAYMENT).optional(),
  production: z.enum([...SALE_PRODUCTION, 'cancelled']).optional(),
  /** Only sales whose material cost is still the estimate (or only recorded ones). */
  estimated: flag,
  cancelled: flag,
});

/** Where a new sale starts from: an order, an approved quote or a saved calculation. */
export const saleDraftQuerySchema = z
  .object({
    orderId: objectIdSchema.optional(),
    quoteId: objectIdSchema.optional(),
    calculationId: objectIdSchema.optional(),
    customerId: objectIdSchema.optional(),
  })
  .refine((q) => [q.orderId, q.quoteId, q.calculationId].filter(Boolean).length <= 1, {
    message: 'Start from one record at a time',
  });
