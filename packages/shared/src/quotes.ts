/**
 * Quote arithmetic, shared by the form (live totals), the server (stored totals) and the PDF.
 * Every line is rounded to cents before it is added, so the document always adds up exactly:
 * the sum of the printed lines is the printed total.
 */
import type { CalcInput } from './schemas/calculator';
import type { CalcResult } from './calculator';
import { divide, multiply, roundToCents, sum, toMicro, type Micro } from './money';
import type { BreakdownKind, QuoteDisplayStatus, QuoteStatus } from './schemas/quote';

const HUNDRED = toMicro('100');
const SIXTY = toMicro('60');

export interface QuoteLineAmounts {
  quantity: Micro;
  unitPrice: Micro;
  discount: Micro;
}

export interface QuoteTotals {
  /** Each line: quantity × unit price, rounded, minus its discount. */
  lines: Micro[];
  subtotal: Micro;
  discount: Micro;
  delivery: Micro;
  /** What taxes apply to: subtotal − discount + delivery. */
  taxBase: Micro;
  taxes: Micro[];
  total: Micro;
}

export function quoteTotals(input: {
  lines: QuoteLineAmounts[];
  discount: Micro;
  delivery: Micro;
  taxes: { percent: Micro }[];
}): QuoteTotals {
  const lines = input.lines.map((l) =>
    Math.max(0, roundToCents(multiply(l.quantity, l.unitPrice)) - roundToCents(l.discount)),
  );
  const subtotal = sum(lines);
  const discount = Math.min(roundToCents(input.discount), subtotal);
  const delivery = roundToCents(input.delivery);
  const taxBase = subtotal - discount + delivery;
  const taxes = input.taxes.map((t) => roundToCents(multiply(taxBase, divide(t.percent, HUNDRED))));
  return { lines, subtotal, discount, delivery, taxBase, taxes, total: sum([taxBase, ...taxes]) };
}

/** A draft or sent quote past its date shows as expired; an outcome is never overridden. */
export function displayStatus(
  status: QuoteStatus,
  validUntil: string | null,
  today: string,
): QuoteDisplayStatus {
  if ((status === 'draft' || status === 'sent') && validUntil && validUntil < today)
    return 'expired';
  return status;
}

/** One row of a line's cost breakdown. Amounts are for the whole line (the batch). */
export interface BreakdownRow {
  kind: BreakdownKind;
  /** The item's own name (roll, material, activity); generic rows are named on render. */
  label: string;
  quantity: Micro | null;
  unit: 'g' | 'h' | 'unit' | 'kwh' | null;
  unitPrice: Micro | null;
  amount: Micro;
}

/**
 * The cost components of a saved calculation, rounded to cents, for the customer-facing
 * breakdown. The added profit is not stored: it is the line's amount minus these rows, so it
 * always reconciles with whatever price the line ends up with.
 */
export function breakdownFromCalculation(input: CalcInput, result: CalcResult): BreakdownRow[] {
  const rows: BreakdownRow[] = [];
  const factor = input.basis === 'unit' ? toMicro(input.quantity) : toMicro(1);
  const batch = (v: Micro) => multiply(v, factor);
  const push = (row: BreakdownRow) => {
    const amount = roundToCents(row.amount);
    if (amount > 0) rows.push({ ...row, amount });
  };

  if (input.filament.enabled) {
    input.filament.lines.forEach((line, i) => {
      const amount = result.lines.filament[i];
      if (amount === null || amount === undefined) return;
      const grams = batch(line.grams);
      push({
        kind: 'filament',
        label: line.label,
        quantity: grams,
        unit: 'g',
        unitPrice: grams > 0 ? divide(amount, grams) : null,
        amount,
      });
    });
  }
  if (input.materials.enabled) {
    input.materials.lines.forEach((line, i) => {
      const amount = result.lines.materials[i];
      if (amount === null || amount === undefined) return;
      const quantity = batch(line.quantity);
      push({
        kind: 'material',
        label: line.label,
        quantity,
        unit: 'unit',
        unitPrice: quantity > 0 ? divide(amount, quantity) : null,
        amount,
      });
    });
  }
  if (input.energy.enabled) {
    push({
      kind: 'energy',
      label: '',
      quantity: result.kwh,
      unit: 'kwh',
      unitPrice: null,
      amount: result.sections.energy,
    });
  }
  if (input.labor.enabled) {
    input.labor.lines.forEach((line, i) => {
      const amount = result.lines.labor[i];
      if (amount === null || amount === undefined) return;
      const hours = batch(divide(toMicro(line.minutes), SIXTY));
      push({
        kind: 'labor',
        label: line.label,
        quantity: hours,
        unit: 'h',
        unitPrice: hours > 0 ? divide(amount, hours) : null,
        amount,
      });
    });
  }
  if (input.machine.enabled && result.machineRate !== null) {
    push({
      kind: 'machine',
      label: input.machine.label,
      quantity: result.hours,
      unit: 'h',
      unitPrice: result.machineRate,
      amount: result.sections.machine,
    });
  }
  if (input.risk.enabled) {
    push({
      kind: 'risk',
      label: '',
      quantity: null,
      unit: null,
      unitPrice: null,
      amount: result.sections.risk,
    });
  }
  if (result.sections.fees > 0) {
    push({
      kind: 'fees',
      label: '',
      quantity: null,
      unit: null,
      unitPrice: null,
      amount: result.sections.fees,
    });
  }
  return rows;
}

/** The breakdown's estimated cost and the profit that brings it to the line's amount. */
export function breakdownSummary(rows: BreakdownRow[], lineAmount: Micro) {
  const cost = sum(rows.map((r) => r.amount));
  return { cost, profit: lineAmount - cost };
}

/** "ORC-0007": the business's own quote number. */
export const quoteCode = (number: number) => `ORC-${String(number).padStart(4, '0')}`;
