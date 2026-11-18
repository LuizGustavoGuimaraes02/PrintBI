import { z } from 'zod';
import { CURRENCIES, parseDecimal } from '../money';

export const currencySchema = z.enum(CURRENCIES);

/**
 * Accepts a decimal string from a form or JSON body ("25", "0.025") and outputs micro-units.
 * Strings avoid float rounding before the value reaches the server.
 */
export const decimalSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, 'Enter a valid number')
  .transform((value) => parseDecimal(value));

export const nonNegativeDecimalSchema = decimalSchema.refine((micro) => micro >= 0, {
  message: 'Must be zero or more',
});

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
