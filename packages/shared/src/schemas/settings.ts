import { z } from 'zod';
import { currencySchema, decimalSchema, nonNegativeDecimalSchema, objectIdSchema } from './common';

/** Money as sent by forms: a decimal string plus its currency. Parsed to micro-units. */
export const moneyInputSchema = z.object({
  amount: nonNegativeDecimalSchema,
  currency: currencySchema,
});

/** Percentages are decimals too ("40" = 40%), stored in micro-units like money. */
export const percentSchema = nonNegativeDecimalSchema.refine((micro) => micro <= 1_000_000_000, {
  message: 'Must be 1000% or less',
});

const days = z.coerce.number().int().min(1, 'At least 1 day').max(365, 'At most 365 days');

export const RISK_BASES = ['filament', 'materials', 'total'] as const;
export const riskBaseSchema = z.enum(RISK_BASES);

export const currencySettingsSchema = z.object({
  defaultCurrency: currencySchema,
  /** Admin-entered rate for approximate report conversion: how many BRL one CAD buys. */
  brlPerCad: decimalSchema
    .refine((micro) => micro > 0, { message: 'The rate must be greater than zero' })
    .nullable(),
});

export const calculatorDefaultsSchema = z.object({
  energyPricePerKwh: moneyInputSchema,
  laborRatePerHour: moneyInputSchema,
  /** Desired margin on the sale price; must stay below 100%. */
  targetMarginPercent: percentSchema
    .refine((micro) => micro < 100_000_000, { message: 'A margin must be below 100%' })
    .nullable(),
  riskPercent: percentSchema,
  riskBase: riskBaseSchema,
  quoteValidityDays: days,
  paymentTerms: z.string().trim().max(1000),
});

export const reminderSettingsSchema = z.object({
  enabled: z.boolean(),
  quoteWaitingDays: days,
  approvedNotStartedDays: days,
  inProgressDays: days,
  blockedDays: days,
  printedDays: days,
});

export const boardSettingsSchema = z.object({
  /** Days a finished card stays on the active board (sales: after completed AND paid). */
  completedRetentionDays: z.coerce.number().int().min(0).max(365),
});

/** Each section is replaced as a whole; omitted sections stay as they are. */
export const updateSettingsSchema = z
  .object({
    currency: currencySettingsSchema,
    calculator: calculatorDefaultsSchema,
    reminders: reminderSettingsSchema,
    board: boardSettingsSchema,
  })
  .partial();

export const PRINTER_STATUSES = ['active', 'maintenance', 'retired'] as const;

const optionalText = (max: number) => z.string().trim().max(max).default('');

/** Machine cost: either a direct cost per hour, or the inputs to derive it from the purchase. */
export const printerRecoverySchema = z.object({
  years: decimalSchema.refine((v) => v > 0, { message: 'Must be greater than zero' }),
  hoursPerDay: decimalSchema.refine((v) => v > 0 && v <= 24_000_000, {
    message: 'Between 0 and 24 hours',
  }),
  daysPerYear: decimalSchema.refine((v) => v > 0 && v <= 366_000_000, {
    message: 'Between 0 and 366 days',
  }),
  maintenance: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('amount'), amount: nonNegativeDecimalSchema }),
    z.object({ kind: z.literal('percent'), percent: percentSchema }),
  ]),
});

export const printerInputSchema = z.object({
  name: z.string().trim().min(1, 'Give the printer a name').max(80),
  brand: optionalText(60),
  model: optionalText(60),
  purchasedAt: z.coerce.date().nullable().default(null),
  purchaseCost: moneyInputSchema.nullable().default(null),
  powerWatts: z.coerce.number().int().min(0).max(5000).nullable().default(null),
  costPerHour: moneyInputSchema.nullable().default(null),
  recovery: printerRecoverySchema.nullable().default(null),
  status: z.enum(PRINTER_STATUSES).default('active'),
  notes: optionalText(1000),
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
});

export const updateCategorySchema = z
  .object({ name: categoryInputSchema.shape.name, archived: z.boolean() })
  .partial();

export const embeddedIdParamSchema = objectIdSchema;
