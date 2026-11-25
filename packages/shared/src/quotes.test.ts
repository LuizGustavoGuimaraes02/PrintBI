import { describe, expect, it } from 'vitest';
import { calculate } from './calculator';
import { toMicro } from './money';
import {
  breakdownFromCalculation,
  breakdownSummary,
  displayStatus,
  quoteCode,
  quoteTotals,
} from './quotes';
import type { CalcInput } from './schemas/calculator';

const M = (v: string) => toMicro(v);
const CAD = (v: string) => ({ amount: M(v), currency: 'CAD' as const });

describe('quote totals', () => {
  it('rounds each line before adding, so the printed lines add up to the total', () => {
    const t = quoteTotals({
      lines: [
        { quantity: M('3'), unitPrice: M('3.335'), discount: 0 }, // 10.005 → 10.01
        { quantity: M('10'), unitPrice: M('12.5'), discount: M('5') },
      ],
      discount: M('10'),
      delivery: M('15'),
      taxes: [{ percent: M('13') }],
    });
    expect(t.lines).toEqual([M('10.01'), M('120')]);
    expect(t.subtotal).toBe(M('130.01'));
    expect(t.taxBase).toBe(M('135.01'));
    expect(t.taxes).toEqual([M('17.55')]);
    expect(t.total).toBe(M('152.56'));
    expect(t.subtotal - t.discount + t.delivery + t.taxes[0]!).toBe(t.total);
  });

  it('never discounts below zero', () => {
    const t = quoteTotals({
      lines: [{ quantity: M('1'), unitPrice: M('20'), discount: M('50') }],
      discount: M('99'),
      delivery: 0,
      taxes: [],
    });
    expect(t.lines).toEqual([0]);
    expect(t.total).toBe(0);
  });
});

describe('quote status', () => {
  it('shows a draft or sent quote past its date as expired, never an outcome', () => {
    expect(displayStatus('sent', '2026-11-01', '2026-11-19')).toBe('expired');
    expect(displayStatus('draft', '2026-11-19', '2026-11-19')).toBe('draft');
    expect(displayStatus('approved', '2026-11-01', '2026-11-19')).toBe('approved');
    expect(displayStatus('rejected', '2026-11-01', '2026-11-19')).toBe('rejected');
    expect(displayStatus('sent', null, '2026-11-19')).toBe('sent');
  });

  it('numbers quotes ORC-0001', () => {
    expect(quoteCode(7)).toBe('ORC-0007');
  });
});

describe('cost breakdown (the lamp from the spec)', () => {
  const manual = (label: string, quantity: string, price: string) => ({
    source: 'manual' as const,
    itemId: null,
    lotId: null,
    label,
    quantity: M(quantity),
    unitPrice: CAD(price),
    available: null,
  });
  const input: CalcInput = {
    currency: 'CAD',
    quantity: 1,
    basis: 'unit',
    printMinutes: 240,
    filament: {
      enabled: true,
      lines: [
        {
          source: 'stock',
          itemId: null,
          lotId: null,
          label: 'PLA',
          grams: M('200'),
          costPerGram: CAD('0.025'),
          spoolGrams: null,
          spoolPrice: null,
          available: null,
        },
      ],
    },
    energy: { enabled: true, watts: M('100'), pricePerKwh: CAD('0.5') },
    labor: { enabled: true, lines: [{ label: 'Labor', minutes: 60, ratePerHour: CAD('15') }] },
    machine: {
      enabled: true,
      mode: 'rate',
      printerId: null,
      label: 'Printer time',
      ratePerHour: CAD('1'),
      recovery: null,
    },
    materials: {
      enabled: true,
      lines: [manual('Bulb', '1', '4'), manual('Switch', '1', '1.5'), manual('Screws', '4', '0.4')],
    },
    risk: { enabled: false, percent: 0, base: 'total' },
    fees: { enabled: false, lines: [] },
    pricing: { method: 'manual', percent: 0, unitPrice: M('40') },
    brlPerCad: null,
  };

  it('lists each component at its purchase cost and reconciles with the price', () => {
    const rows = breakdownFromCalculation(input, calculate(input));
    expect(rows.map((r) => [r.kind, r.label, r.amount])).toEqual([
      ['filament', 'PLA', M('5')],
      ['material', 'Bulb', M('4')],
      ['material', 'Switch', M('1.5')],
      ['material', 'Screws', M('1.6')],
      ['energy', '', M('0.2')],
      ['labor', 'Labor', M('15')],
      ['machine', 'Printer time', M('4')],
    ]);
    expect(rows[0]).toMatchObject({ quantity: M('200'), unit: 'g', unitPrice: M('0.025') });
    expect(rows[3]).toMatchObject({ quantity: M('4'), unitPrice: M('0.4') });
    expect(breakdownSummary(rows, M('40'))).toEqual({ cost: M('31.3'), profit: M('8.7') });
  });

  it('counts per-piece amounts for the whole batch', () => {
    const batch = { ...input, quantity: 10 };
    const rows = breakdownFromCalculation(batch, calculate(batch));
    expect(rows[0]).toMatchObject({ quantity: M('2000'), amount: M('50') });
  });
});
