/**
 * Money and decimal quantities as integers in micro-units (millionths).
 *
 *   CAD 0.025   → 25_000
 *   CAD 25.00   → 25_000_000
 *   100 g       → 100_000_000
 *
 * Integers keep arithmetic exact, sortable and summable with MongoDB `$sum`.
 * Intermediate products use BigInt, so multiplications never lose precision.
 * Rounding is always half-up (away from zero), and happens in exactly two places:
 * when an input has more than 6 decimals, and when a result is rounded to cents.
 */

export const CURRENCIES = ['CAD', 'BRL'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Integer amount in millionths of a unit. */
export type Micro = number;

export interface Money {
  amount: Micro;
  currency: Currency;
}

export const MICRO_PER_UNIT = 1_000_000;
const MICRO = 1_000_000n;
const MICRO_PER_CENT = 10_000n;
const DECIMAL_PATTERN = /^([+-])?(\d+)(?:\.(\d+))?$/;

const DEFAULT_LOCALE: Record<Currency, string> = {
  CAD: 'en-CA',
  BRL: 'pt-BR',
};

export class MoneyError extends Error {
  override name = 'MoneyError';
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

function assertMicro(value: number, label = 'value'): void {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a safe integer in micro-units, got ${value}`);
  }
}

function toSafeNumber(value: bigint): Micro {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new MoneyError('Result is out of the safe range');
  return result;
}

/** Integer division rounded half-up (away from zero). */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (n * 2n + d) / (d * 2n);
  return negative ? -quotient : quotient;
}

/** Parses a decimal string ("25", "0.025", "-3.5") into micro-units. */
export function parseDecimal(input: string): Micro {
  const match = DECIMAL_PATTERN.exec(input.trim());
  if (!match) throw new MoneyError(`Invalid decimal: "${input}"`);

  const [, sign, integerPart = '0', fractionPart = ''] = match;
  const digits = fractionPart.padEnd(7, '0');
  let micro = BigInt(integerPart) * MICRO + BigInt(digits.slice(0, 6));
  if (Number(digits[6]) >= 5) micro += 1n;

  return toSafeNumber(sign === '-' ? -micro : micro);
}

/** Converts a decimal string or a JS number into micro-units. */
export function toMicro(value: string | number): Micro {
  if (typeof value === 'string') return parseDecimal(value);
  if (!Number.isFinite(value)) throw new MoneyError(`Invalid number: ${value}`);
  // toFixed(7) yields a plain decimal string (no exponent) for the ranges we accept.
  return parseDecimal(value.toFixed(7));
}

/** Formats micro-units as a plain decimal string, without trailing zeros ("0.025"). */
export function toDecimalString(value: Micro): string {
  assertMicro(value);
  const negative = value < 0;
  const abs = BigInt(Math.abs(value));
  const integerPart = abs / MICRO;
  const fraction = (abs % MICRO).toString().padStart(6, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${integerPart}${fraction ? `.${fraction}` : ''}`;
}

/** Sum of micro values. */
export function sum(values: readonly Micro[]): Micro {
  let total = 0n;
  for (const value of values) {
    assertMicro(value);
    total += BigInt(value);
  }
  return toSafeNumber(total);
}

/** a × b, both in micro-units (e.g. cost per gram × grams). */
export function multiply(a: Micro, b: Micro): Micro {
  assertMicro(a, 'a');
  assertMicro(b, 'b');
  return toSafeNumber(divideRounded(BigInt(a) * BigInt(b), MICRO));
}

/** a ÷ b, both in micro-units (e.g. price ÷ net grams = cost per gram). */
export function divide(a: Micro, b: Micro): Micro {
  assertMicro(a, 'a');
  assertMicro(b, 'b');
  return toSafeNumber(divideRounded(BigInt(a) * MICRO, BigInt(b)));
}

/** Rounds to the nearest cent (half-up), still expressed in micro-units. */
export function roundToCents(value: Micro): Micro {
  assertMicro(value);
  return toSafeNumber(divideRounded(BigInt(value), MICRO_PER_CENT) * MICRO_PER_CENT);
}

export function money(amount: Micro, currency: Currency): Money {
  assertMicro(amount, 'amount');
  return { amount, currency };
}

/** Adds amounts of the same currency. Different currencies are never summed silently. */
export function sumMoney(items: readonly Money[], currency: Currency): Money {
  const mismatch = items.find((item) => item.currency !== currency);
  if (mismatch) {
    throw new MoneyError(
      `Cannot add ${mismatch.currency} to ${currency} without a conversion rate`,
    );
  }
  return money(sum(items.map((item) => item.amount)), currency);
}

export interface FormatOptions {
  locale?: string;
  /** 'cents' (default) rounds to 2 decimals; 'unit' keeps up to 4, for unit costs like 0.025/g. */
  precision?: 'cents' | 'unit';
  /** 'code' (default) shows CAD 1,200.00: explicit, since CAD and BRL both use a dollar-like sign. */
  display?: 'code' | 'symbol';
}

export function formatMoney(value: Money, options: FormatOptions = {}): string {
  const {
    locale = DEFAULT_LOCALE[value.currency],
    precision = 'cents',
    display = 'code',
  } = options;
  const amount = precision === 'cents' ? roundToCents(value.amount) : value.amount;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    currencyDisplay: display,
    minimumFractionDigits: 2,
    maximumFractionDigits: precision === 'cents' ? 2 : 4,
  }).format(amount / MICRO_PER_UNIT);
}
