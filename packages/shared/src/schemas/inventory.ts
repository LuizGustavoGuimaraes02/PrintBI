import { z } from 'zod';
import { HEX_COLOR } from '../inventory/colors';
import { decimalSchema, nonNegativeDecimalSchema, objectIdSchema } from './common';
import { moneyInputSchema } from './settings';

export const ITEM_KINDS = ['filament', 'material', 'packaging', 'other'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const UNITS = ['g', 'unit', 'm', 'ml', 'custom'] as const;
export type Unit = (typeof UNITS)[number];

export const CONSUMABLE_CATEGORIES = [
  'Fasteners',
  'Packaging',
  'Accessories',
  'Electronics',
  'Other',
] as const;

/** Suggested filament materials; any other text is accepted too. */
export const MATERIAL_TYPES = [
  'PLA',
  'PLA Matte',
  'PLA Silk',
  'PLA+',
  'PETG',
  'ABS',
  'ASA',
  'TPU',
  'Nylon',
] as const;

export const LOT_STATUSES = ['sealed', 'in_use', 'empty', 'archived'] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export const MOVEMENT_TYPES = [
  'purchase',
  'consumption',
  'loss',
  'adjustment',
  'return',
  'correction',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const PAYMENT_METHODS = ['cash', 'credit', 'debit', 'transfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const text = (max: number) => z.string().trim().max(max).default('');
const positiveDecimal = decimalSchema.refine((v) => v > 0, {
  message: 'Must be greater than zero',
});
const temperature = z.coerce.number().int().min(0).max(500).nullable().default(null);

export const filamentSpecSchema = z
  .object({
    /** Catalog product it was filled from, or null when typed by hand. */
    productId: objectIdSchema.nullable().default(null),
    materialType: z.string().trim().min(1, 'Choose or type a material').max(40),
    brand: text(60),
    /** A color from the catalog, or null for a custom color. */
    colorKey: z.string().trim().max(80).nullable().default(null),
    colorName: z.string().trim().min(1, 'Name the color').max(60),
    /** Custom color swatch; ignored when a catalog color is chosen. */
    colorHex: z.string().regex(HEX_COLOR, 'Use a color like #1F2328').nullable().default(null),
    diameterMm: z.coerce.number().positive().max(5).default(1.75),
    densityGcm3: z.coerce.number().positive().max(10).nullable().default(null),
    nozzleTempMin: temperature,
    nozzleTempMax: temperature,
    bedTempMin: temperature,
    bedTempMax: temperature,
  })
  .refine((f) => f.colorKey !== null || f.colorHex !== null, {
    message: 'Pick a color from the catalog or a custom color',
    path: ['colorKey'],
  });

const itemBase = {
  name: z.string().trim().min(1, 'Give the item a name').max(120),
  /** Warn when the total left in active lots drops to this quantity or below. */
  lowStockThreshold: nonNegativeDecimalSchema.nullable().default(null),
  notes: text(1000),
};

export const itemInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('filament'), ...itemBase, filament: filamentSpecSchema }),
  z.object({
    kind: z.enum(['material', 'packaging', 'other']),
    ...itemBase,
    category: z.string().trim().min(1, 'Choose a category').max(40),
    description: text(500),
    unit: z.enum(UNITS),
    customUnit: text(20),
  }),
]);
export type ItemInput = z.input<typeof itemInputSchema>;

/** Paying for a purchase: either already paid on a date, or still pending. */
export const purchaseExpenseSchema = z.object({
  categoryId: objectIdSchema,
  paidAt: z.coerce.date().nullable().default(null),
  method: z.enum(PAYMENT_METHODS).default('credit'),
});

export const lotInputSchema = z
  .object({
    /** Auto-generated when empty (e.g. "Roll 3"). */
    label: text(40),
    /** Net filament weight in grams, or the purchased quantity for other items. */
    originalQuantity: positiveDecimal,
    /** What is left now: equal to the original for a new lot, less for a partly used one. */
    remaining: nonNegativeDecimalSchema,
    totalCost: moneyInputSchema.nullable().default(null),
    purchasedAt: z.coerce.date().nullable().default(null),
    store: text(80),
    notes: text(500),
    /** Filament rolls: warn below this many grams. Null uses the company default. */
    lowStockThreshold: nonNegativeDecimalSchema.nullable().default(null),
    /** Also record the purchase as one linked expense. Null for stock bought before the app. */
    expense: purchaseExpenseSchema.nullable().default(null),
  })
  .refine((lot) => lot.remaining <= lot.originalQuantity, {
    message: 'Cannot have more left than was bought',
    path: ['remaining'],
  })
  .refine((lot) => lot.expense === null || lot.totalCost !== null, {
    message: 'Enter the price to record it as an expense',
    path: ['totalCost'],
  });
export type LotInput = z.input<typeof lotInputSchema>;

export const createItemSchema = z.object({
  item: itemInputSchema,
  firstLot: lotInputSchema.nullable().default(null),
});

export const updateLotSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    store: z.string().trim().max(80),
    notes: z.string().trim().max(500),
    purchasedAt: z.coerce.date().nullable(),
    archived: z.boolean(),
    /** Only while nothing has been taken from the lot yet. */
    totalCost: moneyInputSchema.nullable(),
    /** Null goes back to the company default. */
    lowStockThreshold: nonNegativeDecimalSchema.nullable(),
  })
  .partial();

/**
 * Several rolls bought together (one order): each line is a filament and color, created
 * if new or added to the matching item, with how many identical rolls came.
 * One optional expense covers the whole order.
 */
export const purchaseLineSchema = z.object({
  /** Add to this existing item; otherwise `item` describes it (matched or created). */
  itemId: objectIdSchema.nullable().default(null),
  item: itemInputSchema.nullable().default(null),
  rolls: z.coerce.number().int().min(1, 'At least one').max(50, 'At most 50 per line'),
  /** Per roll: net filament weight in grams (or quantity for other items). */
  originalQuantity: positiveDecimal,
  /** Per roll. */
  totalCost: moneyInputSchema.nullable().default(null),
  lowStockThreshold: nonNegativeDecimalSchema.nullable().default(null),
  notes: text(500),
});

export const purchaseSchema = z
  .object({
    purchasedAt: z.coerce.date().nullable().default(null),
    store: text(80),
    lines: z.array(purchaseLineSchema).min(1, 'Add at least one line').max(50),
    expense: purchaseExpenseSchema.nullable().default(null),
  })
  .superRefine((purchase, ctx) => {
    purchase.lines.forEach((line, index) => {
      if (!line.itemId && !line.item) {
        ctx.addIssue({
          code: 'custom',
          message: 'Describe the item',
          path: ['lines', index, 'item'],
        });
      }
    });
    if (!purchase.expense) return;
    const currencies = new Set(purchase.lines.map((l) => l.totalCost?.currency ?? null));
    if (currencies.has(null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a price on every line to record the expense',
        path: ['expense'],
      });
    } else if (currencies.size > 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'One expense needs one currency on every line',
        path: ['expense'],
      });
    }
  });
export type PurchaseInput = z.input<typeof purchaseSchema>;

export const consumptionSchema = z.object({
  type: z.enum(['consumption', 'loss']),
  reason: text(300),
  lines: z
    .array(z.object({ itemId: objectIdSchema, lotId: objectIdSchema, quantity: positiveDecimal }))
    .min(1, 'Add at least one line')
    .max(30),
  orderId: objectIdSchema.nullable().default(null),
  saleId: objectIdSchema.nullable().default(null),
});

export const adjustLotSchema = z.object({
  countedQuantity: nonNegativeDecimalSchema,
  reason: z.string().trim().min(1, 'Explain the adjustment').max(300),
});

export const reverseMovementSchema = z.object({
  reason: z.string().trim().min(1, 'Explain the correction').max(300),
});

/** Header every stock-changing request carries, so a retry or double click does nothing. */
export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const idempotencyKeySchema = z.string().trim().min(8).max(100);
