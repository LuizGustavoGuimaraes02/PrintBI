import { describe, expect, it } from 'vitest';
import { calculate } from './calculator';
import { toMicro, type Currency } from './money';
import type { CalcInput } from './schemas/calculator';

const M = (v: string) => toMicro(v);
const money = (amount: string, currency: Currency = 'CAD') => ({ amount: M(amount), currency });

/** Everything off: each test switches on what it checks. */
function input(extra: Partial<CalcInput> = {}): CalcInput {
  return {
    currency: 'CAD',
    quantity: 1,
    basis: 'unit',
    printMinutes: 0,
    filament: { enabled: false, lines: [] },
    energy: { enabled: false, watts: 0, pricePerKwh: money('0') },
    labor: { enabled: false, lines: [] },
    machine: {
      enabled: false,
      mode: 'rate',
      printerId: null,
      label: '',
      ratePerHour: null,
      recovery: null,
    },
    materials: { enabled: false, lines: [] },
    risk: { enabled: false, percent: 0, base: 'total' },
    fees: { enabled: false, lines: [] },
    pricing: { method: 'manual', percent: 0, unitPrice: 0 },
    brlPerCad: null,
    ...extra,
  };
}

const stockGrams = (grams: string, perGram: string, available: string | null = null) => ({
  source: 'stock' as const,
  itemId: null,
  lotId: null,
  label: '',
  grams: M(grams),
  costPerGram: money(perGram),
  spoolGrams: null,
  spoolPrice: null,
  available: available === null ? null : M(available),
});

const material = (quantity: string, unitPrice: string, currency: Currency = 'CAD') => ({
  source: 'manual' as const,
  itemId: null,
  lotId: null,
  label: '',
  quantity: M(quantity),
  unitPrice: money(unitPrice, currency),
  available: null,
});

describe('calculator: cost sections (examples from the spec)', () => {
  it('adds several filaments: 100 g black + 30 g white = CAD 3.40', () => {
    const r = calculate(
      input({
        filament: { enabled: true, lines: [stockGrams('100', '0.025'), stockGrams('30', '0.03')] },
      }),
    );
    expect(r.lines.filament).toEqual([M('2.5'), M('0.9')]);
    expect(r.sections.filament).toBe(M('3.4'));
  });

  it('works out a manual filament from the spool weight and price', () => {
    const r = calculate(
      input({
        filament: {
          enabled: true,
          lines: [
            {
              ...stockGrams('200', '0'),
              source: 'manual',
              costPerGram: null,
              spoolGrams: M('1000'),
              spoolPrice: money('25'),
            },
          ],
        },
      }),
    );
    expect(r.sections.filament).toBe(M('5'));
  });

  it('prices energy: 150 W for 4 h = 0.6 kWh, CAD 0.09 at CAD 0.15/kWh', () => {
    const r = calculate(
      input({
        printMinutes: 240,
        energy: { enabled: true, watts: M('150'), pricePerKwh: money('0.15') },
      }),
    );
    expect(r.kwh).toBe(M('0.6'));
    expect(r.sections.energy).toBe(M('0.09'));
  });

  it('prices labor: 2 h × CAD 25/h = CAD 50', () => {
    const r = calculate(
      input({
        labor: {
          enabled: true,
          lines: [{ label: 'Modelling', minutes: 120, ratePerHour: money('25') }],
        },
      }),
    );
    expect(r.sections.labor).toBe(M('50'));
  });

  it('allocates the machine from its recovery plan: CAD 0.15/h × 4 h', () => {
    const r = calculate(
      input({
        printMinutes: 240,
        machine: {
          enabled: true,
          mode: 'recovery',
          printerId: null,
          label: '',
          ratePerHour: null,
          recovery: {
            purchase: money('600'),
            years: M('2'),
            daysPerYear: M('300'),
            hoursPerDay: M('8'),
            maintenance: { kind: 'percent', percent: M('20') },
          },
        },
      }),
    );
    expect(r.machineRate).toBe(M('0.15'));
    expect(r.sections.machine).toBe(M('0.6'));
  });

  it('refuses a machine plan with zero hours instead of dividing by zero', () => {
    const r = calculate(
      input({
        machine: {
          enabled: true,
          mode: 'recovery',
          printerId: null,
          label: '',
          ratePerHour: null,
          recovery: {
            purchase: money('600'),
            years: 0,
            daysPerYear: M('300'),
            hoursPerDay: M('8'),
            maintenance: { kind: 'amount', amount: 0 },
          },
        },
      }),
    );
    expect(r.machineRate).toBeNull();
    expect(r.warnings).toContainEqual({ code: 'machine_rate_missing' });
  });

  it('adds consumables: screws, magnets and a box = CAD 3.10', () => {
    const r = calculate(
      input({
        materials: {
          enabled: true,
          lines: [material('4', '0.4'), material('2', '0.25'), material('1', '1')],
        },
      }),
    );
    expect(r.sections.materials).toBe(M('3.1'));
  });

  it('applies the risk allowance on the chosen base only', () => {
    const base = {
      filament: { enabled: true, lines: [stockGrams('100', '0.04')] },
      materials: { enabled: true, lines: [material('1', '1')] },
      labor: { enabled: true, lines: [{ label: '', minutes: 60, ratePerHour: money('5') }] },
    };
    const on = (b: 'filament' | 'materials' | 'total') =>
      calculate(input({ ...base, risk: { enabled: true, percent: M('10'), base: b } })).sections
        .risk;
    expect(on('filament')).toBe(M('0.4'));
    expect(on('materials')).toBe(M('0.5'));
    expect(on('total')).toBe(M('1'));
  });
});

describe('calculator: unit or batch', () => {
  const filament = { enabled: true, lines: [stockGrams('100', '0.025')] };

  it('does not multiply a batch total again: 10 keychains, 4 h and 100 g in total', () => {
    const r = calculate(input({ quantity: 10, basis: 'batch', printMinutes: 240, filament }));
    expect(r.hours).toBe(M('4'));
    expect(r.batchCost).toBe(M('2.5'));
    expect(r.unitCost).toBe(M('0.25'));
  });

  it('multiplies per-piece values by the quantity', () => {
    const r = calculate(input({ quantity: 10, basis: 'unit', printMinutes: 24, filament }));
    expect(r.hours).toBe(M('4'));
    expect(r.batchCost).toBe(M('25'));
    expect(r.unitCost).toBe(M('2.5'));
  });

  it('warns when the batch needs more than the roll has, without blocking', () => {
    const r = calculate(
      input({
        quantity: 5,
        basis: 'unit',
        filament: { enabled: true, lines: [stockGrams('100', '0.025', '300')] },
      }),
    );
    expect(r.warnings).toContainEqual({
      code: 'stock_short',
      section: 'filament',
      index: 0,
      needed: M('500'),
      available: M('300'),
    });
    expect(r.price).not.toBeNull();
  });
});

describe('calculator: pricing', () => {
  /** A fixed CAD 60 cost, as a single material line. */
  const cost60 = { materials: { enabled: true, lines: [material('1', '60')] } };

  it('prices by margin: cost 60 at 40% → 100, profit 40', () => {
    const r = calculate(
      input({ ...cost60, pricing: { method: 'margin', percent: M('40'), unitPrice: 0 } }),
    );
    expect(r.price?.unit).toBe(M('100'));
    expect(r.profit?.unit).toBe(M('40'));
    expect(r.marginPercent).toBe(M('40'));
  });

  it('prices by markup: cost 60 at 40% → 84, profit 24', () => {
    const r = calculate(
      input({ ...cost60, pricing: { method: 'markup', percent: M('40'), unitPrice: 0 } }),
    );
    expect(r.price?.unit).toBe(M('84'));
    expect(r.profit?.unit).toBe(M('24'));
    expect(r.markupPercent).toBe(M('40'));
  });

  it('shows profit for a manual price: 13.75 of cost at 25 → 11.25', () => {
    const r = calculate(
      input({
        materials: { enabled: true, lines: [material('1', '13.75')] },
        pricing: { method: 'manual', percent: 0, unitPrice: M('25') },
      }),
    );
    expect(r.profit?.unit).toBe(M('11.25'));
  });

  it('refuses a margin of 100% or more', () => {
    const r = calculate(
      input({ ...cost60, pricing: { method: 'margin', percent: M('100'), unitPrice: 0 } }),
    );
    expect(r.price).toBeNull();
    expect(r.warnings).toContainEqual({ code: 'margin_too_high' });
  });

  it('solves fees on the price without a circular formula', () => {
    // Margin 30% and a 10% platform fee: price = 60 ÷ (1 − 0.4) = 100; fee 10; profit 30.
    const r = calculate(
      input({
        ...cost60,
        fees: {
          enabled: true,
          lines: [{ label: 'Platform', kind: 'price_percent', value: M('10') }],
        },
        pricing: { method: 'margin', percent: M('30'), unitPrice: 0 },
      }),
    );
    expect(r.price?.unit).toBe(M('100'));
    expect(r.priceFees.unit).toBe(M('10'));
    expect(r.profit?.unit).toBe(M('30'));
  });

  it('adds tax on top for the customer without touching profit', () => {
    const r = calculate(
      input({
        ...cost60,
        fees: { enabled: true, lines: [{ label: 'HST', kind: 'tax_added', value: M('13') }] },
        pricing: { method: 'manual', percent: 0, unitPrice: M('100') },
      }),
    );
    expect(r.taxAdded.unit).toBe(M('13'));
    expect(r.customerPays?.unit).toBe(M('113'));
    expect(r.profit?.unit).toBe(M('40'));
  });

  it('adds fixed and cost-based fees to the cost', () => {
    const r = calculate(
      input({
        ...cost60,
        fees: {
          enabled: true,
          lines: [
            { label: 'Packaging fee', kind: 'fixed', value: M('2') },
            { label: 'Card on cost', kind: 'cost_percent', value: M('5') },
          ],
        },
      }),
    );
    expect(r.sections.fees).toBe(M('5'));
    expect(r.unitCost).toBe(M('65'));
  });

  it('warns when the price is below the cost', () => {
    const r = calculate(
      input({ ...cost60, pricing: { method: 'manual', percent: 0, unitPrice: M('50') } }),
    );
    expect(r.warnings).toContainEqual({ code: 'below_cost' });
  });
});

describe('calculator: currencies', () => {
  it('converts a line in the other currency with the rate from Settings', () => {
    const r = calculate(
      input({
        brlPerCad: M('4'),
        materials: { enabled: true, lines: [material('1', '40', 'BRL')] },
      }),
    );
    expect(r.sections.materials).toBe(M('10'));
    expect(r.complete).toBe(true);
  });

  it('never invents a sum without a rate', () => {
    const r = calculate(
      input({
        materials: { enabled: true, lines: [material('1', '10'), material('1', '40', 'BRL')] },
      }),
    );
    expect(r.complete).toBe(false);
    expect(r.lines.materials).toEqual([M('10'), null]);
    expect(r.warnings).toContainEqual({
      code: 'needs_rate',
      section: 'materials',
      index: 1,
      currency: 'BRL',
    });
  });
});
