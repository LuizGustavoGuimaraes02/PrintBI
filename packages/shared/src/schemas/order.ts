import { z } from 'zod';
import { nonNegativeDecimalSchema, objectIdSchema } from './common';
import { consumptionSchema } from './inventory';
import { moneyInputSchema } from './settings';

/**
 * Orders: anything to print, for a customer (sale), as a gift or for personal use.
 * Production (the board column) and payment are separate: a card can be Ready and unpaid.
 */

export const ORDER_TYPES = ['sale', 'gift', 'personal'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

/**
 * The board columns, left to right: To do, Printing, Ready, Done. What used to be its own
 * column (waiting for a quote, blocked) is now a flag on the card: see `blocked`.
 */
export const BOARD_COLUMNS = ['todo', 'in_progress', 'ready', 'completed'] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/** Columns of the first board, still found in old history entries and moved by the migration. */
export const LEGACY_STATUSES = ['quote_draft', 'waiting', 'blocked', 'printed'] as const;
export type LegacyStatus = (typeof LEGACY_STATUSES)[number];
export const LEGACY_STATUS_TARGET: Record<LegacyStatus, BoardColumn> = {
  quote_draft: 'todo',
  waiting: 'todo',
  blocked: 'todo',
  printed: 'ready',
};

/** A cancelled order leaves the board but keeps its history. */
export const ORDER_STATUSES = [...BOARD_COLUMNS, 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid', 'not_required'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** What a card is waiting for. It stays in its column, flagged, until this is cleared. */
export const BLOCK_REASONS = [
  'quote_approval',
  'material_missing',
  'printer_issue',
  'print_failure',
  'waiting_customer',
  'other',
] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];

export const RECIPIENT_KINDS = ['customer', 'name', 'myself'] as const;
export type RecipientKind = (typeof RECIPIENT_KINDS)[number];

const text = (max: number) => z.string().trim().max(max).default('');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');
const optionalDate = isoDate.nullable().default(null);

export const recipientSchema = z
  .object({
    kind: z.enum(RECIPIENT_KINDS),
    customerId: objectIdSchema.nullable().default(null),
    /** A plain name for this order only (kind "name"). */
    name: text(120),
  })
  .superRefine((r, ctx) => {
    if (r.kind === 'customer' && !r.customerId) {
      ctx.addIssue({ code: 'custom', message: 'Choose a customer', path: ['customerId'] });
    }
    if (r.kind === 'name' && !r.name) {
      ctx.addIssue({ code: 'custom', message: 'Who is it for?', path: ['name'] });
    }
  });

export const blockedSchema = z.object({
  reason: z.enum(BLOCK_REASONS),
  note: text(300),
});

export const orderInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the order a title').max(160),
    type: z.enum(ORDER_TYPES),
    description: text(2000),
    /** A catalog product or service, or null for an ad hoc item. */
    productId: objectIdSchema.nullable().default(null),
    quantity: z.coerce.number().int().min(1, 'At least one').max(100_000),
    labelIds: z.array(objectIdSchema).max(20).default([]),
    recipient: recipientSchema,
    orderDate: isoDate,
    dueDate: optionalDate,
    plannedStart: optionalDate,
    priority: z.enum(ORDER_PRIORITIES).default('normal'),
    /** One primary printer per order; null while not assigned. */
    printerId: objectIdSchema.nullable().default(null),
    material: text(120),
    colors: text(160),
    estimatedMinutes: z.coerce.number().int().min(0).max(100_000).nullable().default(null),
    /** Grams, as a decimal string. Estimates never touch stock. */
    estimatedGrams: nonNegativeDecimalSchema.nullable().default(null),
    finishingNotes: text(1000),
    modelUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), { message: 'Use a full link' })
      .default(''),
    internalNotes: text(2000),
    /** Sales only. */
    agreedPrice: moneyInputSchema.nullable().default(null),
    paymentStatus: z.enum(PAYMENT_STATUSES).default('unpaid'),
    /** Cost estimate from the calculator (financial data). */
    estimatedCost: moneyInputSchema.nullable().default(null),
    /** Only when creating: the approved quote it comes from, and the starting column. */
    quoteId: objectIdSchema.nullable().default(null),
    status: z.enum(BOARD_COLUMNS).default('todo'),
    /** Created already waiting for something; afterwards the flag changes through its action. */
    blocked: blockedSchema.nullable().default(null),
    /** Rolls from stock picked for this job; grams are the file's estimate, never deducted. */
    filaments: z
      .array(
        z.object({
          itemId: objectIdSchema,
          grams: nonNegativeDecimalSchema.nullable().default(null),
        }),
      )
      .max(6)
      .default([])
      .refine((list) => new Set(list.map((f) => f.itemId)).size === list.length, {
        message: 'The same roll is picked twice',
      }),
  })
  .superRefine((o, ctx) => {
    if (o.dueDate && o.dueDate < o.orderDate) {
      ctx.addIssue({ code: 'custom', message: 'Due before the order date', path: ['dueDate'] });
    }
    if (o.type === 'personal' && o.recipient.kind === 'customer') {
      ctx.addIssue({
        code: 'custom',
        message: 'A personal job is for you',
        path: ['recipient', 'kind'],
      });
    }
    if (o.quoteId && o.type !== 'sale') {
      ctx.addIssue({ code: 'custom', message: 'Only a sale comes from a quote', path: ['type'] });
    }
  });
export type OrderInput = z.output<typeof orderInputSchema>;
export type OrderInputForm = z.input<typeof orderInputSchema>;

/**
 * Moves a card: to a column, and to a spot inside it. `afterId` is the card it should sit
 * below (null for the top); left out, the card goes where its deadline suggests.
 */
export const orderMoveSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  afterId: objectIdSchema.nullable().optional(),
  note: text(300),
});

/** Largest card picture the API keeps, after the browser shrinks it. */
export const ORDER_PICTURE_MAX_BYTES = 64 * 1024;

/** A card picture as a data URL: PNG, JPEG or WebP. */
export const orderPictureSchema = z.object({
  dataUrl: z
    .string()
    .max(Math.ceil((ORDER_PICTURE_MAX_BYTES * 4) / 3) + 40, 'The picture is too large')
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Use a PNG, JPEG or WebP image'),
});

/** Flags a card as waiting for something (quote approval, filament…), or clears the flag. */
export const orderHoldSchema = z.object({ blocked: blockedSchema.nullable() });

export const orderPaymentSchema = z.object({ paymentStatus: z.enum(PAYMENT_STATUSES) });

/** Reminders: the customer was contacted, or the reminder waits a few days. */
export const orderReminderSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('contacted') }),
  z.object({ action: z.literal('snooze'), days: z.coerce.number().int().min(1).max(30) }),
  z.object({ action: z.literal('unsnooze') }),
]);

/** Stock used by one order: the same lines as any consumption, tied to the order. */
export const orderConsumptionSchema = consumptionSchema.omit({ orderId: true, saleId: true });

const flag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const orderFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(ORDER_TYPES).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  customerId: objectIdSchema.optional(),
  /** A printer's queue, or "none" for jobs without one. */
  printerId: z.union([objectIdSchema, z.literal('none')]).optional(),
  priority: z.enum(ORDER_PRIORITIES).optional(),
  overdue: flag,
  deadline: z.enum(['with', 'without']).optional(),
  dueFrom: isoDate.optional(),
  dueTo: isoDate.optional(),
  productId: objectIdSchema.optional(),
  labelId: objectIdSchema.optional(),
  /** Active board (default), cards hidden after completion, or both. */
  board: z.enum(['active', 'hidden', 'all']).default('active'),
  /** "Completed in period" count. */
  completedFrom: z.coerce.date().optional(),
  completedTo: z.coerce.date().optional(),
  /** The viewer's calendar day, for overdue (the server's UTC day may already be tomorrow). */
  today: isoDate.optional(),
});
