import { describe, expect, it } from 'vitest';
import { toMicro } from './money';
import { paymentOf, productionFromOrder, saleCode, saleProfit, saleTotals } from './sales';
import { saleInputSchema } from './schemas/sale';

const M = 1_000_000;

describe('sale totals', () => {
  it('adds lines, takes the discount and adds delivery charged to the customer', () => {
    const totals = saleTotals({
      lines: [
        { quantity: toMicro('10'), unitPrice: toMicro('10'), discount: toMicro('5') },
        { quantity: toMicro('2'), unitPrice: toMicro('12.5'), discount: 0 },
      ],
      discount: toMicro('10'),
      delivery: toMicro('8'),
    });
    expect(totals).toEqual({
      lines: [95 * M, 25 * M],
      subtotal: 120 * M,
      discount: 10 * M,
      delivery: 8 * M,
      total: 118 * M,
    });
  });

  it('numbers sales as VEN-0001', () => {
    expect(saleCode(1)).toBe('VEN-0001');
    expect(saleCode(1234)).toBe('VEN-1234');
  });
});

describe('payment and production', () => {
  it('is paid once the receipts reach the total', () => {
    expect(paymentOf(100 * M, 0)).toBe('unpaid');
    expect(paymentOf(100 * M, 40 * M)).toBe('partial');
    expect(paymentOf(100 * M, 100 * M)).toBe('paid');
    expect(paymentOf(0, 0)).toBe('paid');
  });

  it('follows the linked order on the board', () => {
    expect(productionFromOrder('todo')).toBe('to_start');
    expect(productionFromOrder('in_progress')).toBe('in_production');
    expect(productionFromOrder('ready')).toBe('ready');
    expect(productionFromOrder('completed')).toBe('delivered');
    expect(productionFromOrder('cancelled')).toBe('cancelled');
  });
});

describe('sale profit', () => {
  const base = { total: 30 * M, currency: 'CAD' as const, brlPerCad: null };

  it('the spec example: CAD 30 sale, CAD 13 of costs, CAD 17 profit, 56.67%', () => {
    const profit = saleProfit({
      ...base,
      recorded: [{ amount: 4.5 * M, currency: 'CAD' }],
      recordedLines: 2,
      estimated: 20 * M,
      extras: 8.5 * M,
    });
    expect(profit).toMatchObject({ materials: 4.5 * M, basis: 'recorded', profit: 17 * M });
    expect(profit.margin! / M).toBeCloseTo(56.67, 2);
  });

  it('uses the estimate until stock use is recorded, and says so', () => {
    const profit = saleProfit({
      ...base,
      recorded: [],
      recordedLines: 0,
      estimated: 6 * M,
      extras: 0,
    });
    expect(profit).toMatchObject({ materials: 6 * M, basis: 'estimated', profit: 24 * M });
    expect(
      saleProfit({ ...base, recorded: [], recordedLines: 0, estimated: null, extras: 0 }).basis,
    ).toBe('none');
  });

  it('converts a CAD roll used in a BRL sale with the rate saved on the sale', () => {
    const profit = saleProfit({
      total: 100 * M,
      currency: 'BRL',
      recorded: [{ amount: 3 * M, currency: 'CAD' }],
      recordedLines: 1,
      estimated: null,
      extras: 0,
      brlPerCad: 4 * M,
    });
    expect(profit).toMatchObject({ materials: 12 * M, profit: 88 * M, unconverted: [] });
  });

  it('never adds two currencies without a rate: the other one is set apart', () => {
    const profit = saleProfit({
      total: 100 * M,
      currency: 'BRL',
      recorded: [{ amount: 3 * M, currency: 'CAD' }],
      recordedLines: 1,
      estimated: null,
      extras: 0,
      brlPerCad: null,
    });
    expect(profit).toMatchObject({
      materials: 0,
      unconverted: [{ amount: 3 * M, currency: 'CAD' }],
    });
  });
});

describe('sale input', () => {
  const base = {
    saleDate: '2026-11-25',
    customer: { kind: 'unknown' },
    currency: 'CAD',
    lines: [{ description: 'Keychain', quantity: '10', unitPrice: '10' }],
  };

  it('accepts a quick sale with an unknown customer', () => {
    expect(saleInputSchema.safeParse(base).success).toBe(true);
  });

  it('needs a customer when the kind says so, and at least one line', () => {
    expect(saleInputSchema.safeParse({ ...base, customer: { kind: 'customer' } }).success).toBe(
      false,
    );
    expect(saleInputSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
    expect(
      saleInputSchema.safeParse({
        ...base,
        receipts: [{ amount: '0', receivedAt: '2026-11-25', method: 'cash' }],
      }).success,
    ).toBe(false);
  });
});
