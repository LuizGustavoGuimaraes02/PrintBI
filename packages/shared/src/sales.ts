/**
 * Sale arithmetic shared by the form (live totals), the server (stored totals and views) and
 * the tests. Lines are rounded to cents before they are added, like quotes.
 */
import {
  divide,
  multiply,
  roundToCents,
  toMicro,
  type Currency,
  type Micro,
  type Money,
} from './money';
import { quoteTotals, type QuoteLineAmounts } from './quotes';
import type { OrderStatus } from './schemas/order';
import type { SalePayment, SaleProductionView } from './schemas/sale';

export const saleCode = (number: number) => `VEN-${String(number).padStart(4, '0')}`;

export interface SaleTotals {
  lines: Micro[];
  subtotal: Micro;
  discount: Micro;
  delivery: Micro;
  /** subtotal − discount + delivery charged to the customer. */
  total: Micro;
}

export function saleTotals(input: {
  lines: QuoteLineAmounts[];
  discount: Micro;
  delivery: Micro;
}): SaleTotals {
  const t = quoteTotals({ ...input, taxes: [] });
  return {
    lines: t.lines,
    subtotal: t.subtotal,
    discount: t.discount,
    delivery: t.delivery,
    total: t.total,
  };
}

/** Paid once the receipts reach the total; a sale of zero has nothing to collect. */
export function paymentOf(total: Micro, received: Micro): SalePayment {
  if (received >= total) return 'paid';
  return received > 0 ? 'partial' : 'unpaid';
}

/** A sale linked to an order shows the order's progress. */
export function productionFromOrder(status: OrderStatus): SaleProductionView {
  switch (status) {
    case 'todo':
      return 'to_start';
    case 'in_progress':
      return 'in_production';
    case 'ready':
      return 'ready';
    case 'completed':
      return 'delivered';
    default:
      return 'cancelled';
  }
}

/** An amount in the sale's currency, using the rate saved with the sale (BRL per CAD). */
export function convert(money: Money, to: Currency, brlPerCad: Micro | null): Micro | null {
  if (money.currency === to) return money.amount;
  if (!brlPerCad) return null;
  return roundToCents(
    money.currency === 'CAD' ? multiply(money.amount, brlPerCad) : divide(money.amount, brlPerCad),
  );
}

export type CostBasis = 'recorded' | 'estimated' | 'none';

export interface SaleProfit {
  /** Material cost in the sale's currency: recorded stock use, else the lines' estimates. */
  materials: Micro;
  basis: CostBasis;
  /** Recorded costs in another currency with no rate to convert them: left out, shown apart. */
  unconverted: Money[];
  /** Costs the business entered for this sale (shipping it paid, fees, labor…). */
  extras: Micro;
  profit: Micro;
  /** Profit as a share of the total, in micro-units of a percent; null for a zero total. */
  margin: Micro | null;
}

/**
 * Profit = total − material cost − entered costs. Recorded stock use (from the linked order,
 * or recorded on the sale) wins over the estimate, and the result says which one it used.
 */
export function saleProfit(input: {
  total: Micro;
  currency: Currency;
  /** Used and lost stock per currency, after corrections; empty when nothing was recorded. */
  recorded: Money[];
  recordedLines: number;
  estimated: Micro | null;
  extras: Micro;
  brlPerCad: Micro | null;
}): SaleProfit {
  const unconverted: Money[] = [];
  let materials = 0;
  let basis: CostBasis = 'none';
  if (input.recordedLines > 0) {
    basis = 'recorded';
    for (const money of input.recorded) {
      const amount = convert(money, input.currency, input.brlPerCad);
      if (amount === null) unconverted.push(money);
      else materials += amount;
    }
  } else if (input.estimated !== null) {
    basis = 'estimated';
    materials = input.estimated;
  }
  const profit = input.total - materials - input.extras;
  return {
    materials,
    basis,
    unconverted,
    extras: input.extras,
    profit,
    margin: input.total > 0 ? multiply(divide(profit, input.total), toMicro('100')) : null,
  };
}
