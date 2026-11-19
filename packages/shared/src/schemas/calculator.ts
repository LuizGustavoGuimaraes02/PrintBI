import { z } from 'zod';
import { currencySchema, nonNegativeDecimalSchema, objectIdSchema } from './common';

/**
 * Calculator input. Decimal strings come in and leave as micro-units, like every other money
 * field. Each section can be switched off; lines keep their own currency, converted with the
 * rate from Settings when it differs from the calculation's.
 */

const label = z.string().trim().max(80).default('');
const moneyIn = z.object({ amount: nonNegativeDecimalSchema, currency: currencySchema });
const percent = nonNegativeDecimalSchema.refine((v) => v <= 1_000_000_000, {
  message: 'Use at most 1000%',
});
const minutes = z.coerce.number().int().min(0).max(100_000);
const positive = (message: string) => nonNegativeDecimalSchema.refine((v) => v > 0, { message });

export const CALC_BASES = ['unit', 'batch'] as const;
export type CalcBasis = (typeof CALC_BASES)[number];
export const LINE_SOURCES = ['stock', 'manual'] as const;
export const RISK_BASES_CALC = ['filament', 'materials', 'total'] as const;
export const FEE_KINDS = ['fixed', 'cost_percent', 'price_percent', 'tax_added'] as const;
export type FeeKind = (typeof FEE_KINDS)[number];
export const PRICING_METHODS = ['margin', 'markup', 'manual'] as const;
export type PricingMethod = (typeof PRICING_METHODS)[number];
export const MACHINE_MODES = ['printer', 'rate', 'recovery'] as const;

const filamentLine = z.object({
  source: z.enum(LINE_SOURCES),
  itemId: objectIdSchema.nullable().default(null),
  lotId: objectIdSchema.nullable().default(null),
  label,
  /** Grams per unit or for the whole batch, following the calculation's basis. */
  grams: nonNegativeDecimalSchema,
  /** From the roll (stock) or worked out from the spool below (manual). */
  costPerGram: moneyIn.nullable().default(null),
  spoolGrams: nonNegativeDecimalSchema.nullable().default(null),
  spoolPrice: moneyIn.nullable().default(null),
  /** Grams left on the roll when it was picked; drives the "not enough stock" warning. */
  available: nonNegativeDecimalSchema.nullable().default(null),
});

const materialLine = z.object({
  source: z.enum(LINE_SOURCES),
  itemId: objectIdSchema.nullable().default(null),
  lotId: objectIdSchema.nullable().default(null),
  label,
  quantity: nonNegativeDecimalSchema,
  unitPrice: moneyIn,
  available: nonNegativeDecimalSchema.nullable().default(null),
});

const laborLine = z.object({ label, minutes, ratePerHour: moneyIn });

const feeLine = z.object({
  label,
  kind: z.enum(FEE_KINDS),
  /** A percentage, or an amount in the calculation's currency for a fixed fee. */
  value: nonNegativeDecimalSchema,
});

export const calcInputSchema = z.object({
  currency: currencySchema,
  quantity: z.coerce.number().int().min(1, 'At least one piece').max(100_000),
  basis: z.enum(CALC_BASES),
  printMinutes: minutes,
  filament: z.object({ enabled: z.boolean(), lines: z.array(filamentLine).max(12) }),
  energy: z.object({
    enabled: z.boolean(),
    watts: nonNegativeDecimalSchema,
    pricePerKwh: moneyIn,
  }),
  labor: z.object({ enabled: z.boolean(), lines: z.array(laborLine).max(12) }),
  machine: z.object({
    enabled: z.boolean(),
    mode: z.enum(MACHINE_MODES),
    printerId: objectIdSchema.nullable().default(null),
    label,
    /** Direct cost per print hour (mode "rate", or resolved from the printer). */
    ratePerHour: moneyIn.nullable().default(null),
    recovery: z
      .object({
        purchase: moneyIn,
        years: nonNegativeDecimalSchema,
        daysPerYear: nonNegativeDecimalSchema,
        hoursPerDay: nonNegativeDecimalSchema,
        maintenance: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('amount'), amount: nonNegativeDecimalSchema }),
          z.object({ kind: z.literal('percent'), percent }),
        ]),
      })
      .nullable()
      .default(null),
  }),
  materials: z.object({ enabled: z.boolean(), lines: z.array(materialLine).max(24) }),
  risk: z.object({ enabled: z.boolean(), percent, base: z.enum(RISK_BASES_CALC) }),
  fees: z.object({ enabled: z.boolean(), lines: z.array(feeLine).max(12) }),
  pricing: z.object({
    method: z.enum(PRICING_METHODS),
    /** Margin or markup, in percent. */
    percent,
    /** Manual price for one piece. */
    unitPrice: nonNegativeDecimalSchema,
  }),
  /** How many BRL one CAD buys, for lines in the other currency. Copied from Settings. */
  brlPerCad: positive('The rate must be greater than zero').nullable().default(null),
});

export type CalcInput = z.output<typeof calcInputSchema>;
export type CalcInputForm = z.input<typeof calcInputSchema>;

export const calculationSaveSchema = z.object({
  name: z.string().trim().min(1, 'Name the calculation').max(120),
  productId: objectIdSchema.nullable().default(null),
  notes: z.string().trim().max(2000).default(''),
  input: calcInputSchema,
  /** Also write the unit cost into the product's estimated cost. */
  updateProductCost: z.boolean().default(false),
});
export type CalculationSaveInput = z.input<typeof calculationSaveSchema>;

export const calculationFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  productId: objectIdSchema.optional(),
});
