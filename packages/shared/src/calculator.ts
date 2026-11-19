/**
 * The calculator's cost model, on micro-unit integers. The web app runs it live as the user
 * types; the API runs it again when a calculation is saved, so the stored result can be trusted.
 *
 * Rules worth knowing:
 * - Entered time, grams, quantities and fees are either per piece or for the whole batch
 *   (`basis`). They are multiplied by the quantity only in the first case, never twice.
 * - Lines keep their own currency. One in the other currency is converted with `brlPerCad`;
 *   without that rate it can't be added, and the result is marked incomplete instead of
 *   inventing a sum.
 * - Fees on the sale price (platform, card, tax included) are solved algebraically, so a margin
 *   price never depends on itself: price = cost ÷ (1 − margin − price fees).
 * - Every division is guarded: an impossible input yields null and a warning, never Infinity.
 */
import {
  divide,
  multiply,
  roundToCents,
  sum,
  toMicro,
  type Currency,
  type Micro,
  type Money,
} from './money';
import { machineRatePerHour } from './pricing';
import type { CalcInput } from './schemas/calculator';

const HUNDRED = toMicro('100');
const ONE = toMicro('1');
const SIXTY = toMicro('60');
const THOUSAND = toMicro('1000');

export type CalcSection = 'filament' | 'materials' | 'labor' | 'machine' | 'fees';

export type CalcWarning =
  | {
      code: 'stock_short';
      section: 'filament' | 'materials';
      index: number;
      needed: Micro;
      available: Micro;
    }
  | { code: 'needs_rate'; section: CalcSection | 'energy'; index: number; currency: Currency }
  | { code: 'invalid_line'; section: CalcSection; index: number }
  | { code: 'machine_rate_missing' }
  | { code: 'margin_too_high' }
  | { code: 'below_cost' };

export interface CalcResult {
  currency: Currency;
  quantity: number;
  /** Print hours for the whole batch. */
  hours: Micro;
  /** Cost of each section for the whole batch (zero when switched off). */
  sections: {
    filament: Micro;
    materials: Micro;
    energy: Micro;
    labor: Micro;
    machine: Micro;
    risk: Micro;
    fees: Micro;
  };
  kwh: Micro;
  /** Machine cost per print hour actually used, in the calculation's currency. */
  machineRate: Micro | null;
  /** Batch cost of each line, null when it could not be priced. */
  lines: {
    filament: (Micro | null)[];
    materials: (Micro | null)[];
    labor: (Micro | null)[];
    fees: Micro[];
  };
  batchCost: Micro;
  unitCost: Micro;
  /** Price for one piece and for the batch, rounded to cents; null when it can't be worked out. */
  price: { unit: Micro; batch: Micro } | null;
  /** Fees taken out of the price (platform, card, tax included). */
  priceFees: { unit: Micro; batch: Micro };
  profit: { unit: Micro; batch: Micro } | null;
  /** Profit ÷ price and profit ÷ cost, in percent micro-units. */
  marginPercent: Micro | null;
  markupPercent: Micro | null;
  /** Tax charged on top of the price, and what the customer pays with it. */
  taxAdded: { unit: Micro; batch: Micro };
  customerPays: { unit: Micro; batch: Micro } | null;
  /** False when a line needs a conversion rate that is missing: totals leave it out. */
  complete: boolean;
  warnings: CalcWarning[];
}

/** a × (p ÷ 100), for percentages stored as micro-units ("40" → 40_000_000). */
const percentOf = (amount: Micro, percent: Micro) => multiply(amount, divide(percent, HUNDRED));

export function calculate(input: CalcInput): CalcResult {
  const warnings: CalcWarning[] = [];
  let complete = true;
  const quantity = Math.max(1, input.quantity);
  const qty = toMicro(quantity);
  /** Entered values × this = the whole batch. */
  const factor = input.basis === 'unit' ? qty : ONE;
  const batch = (entered: Micro) => multiply(entered, factor);

  /** Converts a line amount into the calculation's currency, or null without a rate. */
  const convert = (value: Money, section: CalcSection | 'energy', index: number): Micro | null => {
    if (value.currency === input.currency) return value.amount;
    const rate = input.brlPerCad;
    if (!rate) {
      warnings.push({ code: 'needs_rate', section, index, currency: value.currency });
      complete = false;
      return null;
    }
    return value.currency === 'CAD' ? multiply(value.amount, rate) : divide(value.amount, rate);
  };

  const enteredHours = divide(toMicro(input.printMinutes), SIXTY);
  const hours = batch(enteredHours);

  // Filament: grams × cost per gram, from the roll or from the spool's weight and price.
  const filamentLines = input.filament.enabled
    ? input.filament.lines.map((line, index) => {
        let perGram: Micro | null = null;
        if (line.source === 'manual' && line.spoolPrice && line.spoolGrams) {
          const price = convert(line.spoolPrice, 'filament', index);
          perGram = price === null ? null : divide(price, line.spoolGrams);
        } else if (line.costPerGram) {
          perGram = convert(line.costPerGram, 'filament', index);
        } else {
          warnings.push({ code: 'invalid_line', section: 'filament', index });
        }
        const needed = batch(line.grams);
        if (line.available !== null && needed > line.available) {
          warnings.push({
            code: 'stock_short',
            section: 'filament',
            index,
            needed,
            available: line.available,
          });
        }
        return perGram === null ? null : multiply(needed, perGram);
      })
    : [];

  const materialLines = input.materials.enabled
    ? input.materials.lines.map((line, index) => {
        const price = convert(line.unitPrice, 'materials', index);
        const needed = batch(line.quantity);
        if (line.available !== null && needed > line.available) {
          warnings.push({
            code: 'stock_short',
            section: 'materials',
            index,
            needed,
            available: line.available,
          });
        }
        return price === null ? null : multiply(needed, price);
      })
    : [];

  const laborLines = input.labor.enabled
    ? input.labor.lines.map((line, index) => {
        const rate = convert(line.ratePerHour, 'labor', index);
        return rate === null ? null : batch(multiply(divide(toMicro(line.minutes), SIXTY), rate));
      })
    : [];

  // Energy: kWh = W ÷ 1000 × hours. An estimated average draw, not a measurement.
  let kwh = 0;
  let energy = 0;
  if (input.energy.enabled) {
    kwh = multiply(divide(input.energy.watts, THOUSAND), hours);
    const price = convert(input.energy.pricePerKwh, 'energy', 0);
    energy = price === null ? 0 : multiply(kwh, price);
  }

  // Machine: an allocation of the printer's cost over its working life.
  let machineRate: Micro | null = null;
  let machine = 0;
  if (input.machine.enabled) {
    const m = input.machine;
    if (m.mode === 'recovery' && m.recovery) {
      // Worked out in the printer's own currency, then converted like any other line.
      const rate = machineRatePerHour({
        purchase: m.recovery.purchase.amount,
        maintenance: m.recovery.maintenance,
        years: m.recovery.years,
        daysPerYear: m.recovery.daysPerYear,
        hoursPerDay: m.recovery.hoursPerDay,
      });
      machineRate =
        rate === null
          ? null
          : convert({ amount: rate, currency: m.recovery.purchase.currency }, 'machine', 0);
    } else if (m.ratePerHour) {
      machineRate = convert(m.ratePerHour, 'machine', 0);
    }
    if (machineRate === null) warnings.push({ code: 'machine_rate_missing' });
    else machine = multiply(machineRate, hours);
  }

  const filament = sum(filamentLines.map((v) => v ?? 0));
  const materials = sum(materialLines.map((v) => v ?? 0));
  const labor = sum(laborLines.map((v) => v ?? 0));

  // Risk / waste allowance on the chosen base. Fees are never part of the base.
  let risk = 0;
  if (input.risk.enabled) {
    const base =
      input.risk.base === 'filament'
        ? filament
        : input.risk.base === 'materials'
          ? sum([filament, materials])
          : sum([filament, materials, energy, labor, machine]);
    risk = percentOf(base, input.risk.percent);
  }
  const subtotal = sum([filament, materials, energy, labor, machine, risk]);

  // Fees: fixed and %-of-cost add to the cost; %-of-price comes out of the price; tax added
  // is charged on top for the customer and is not revenue.
  const fees = input.fees.enabled ? input.fees.lines : [];
  const feeLines = fees.map((fee) => {
    if (fee.kind === 'fixed') return batch(fee.value);
    if (fee.kind === 'cost_percent') return percentOf(subtotal, fee.value);
    return 0;
  });
  const costFees = sum(feeLines);
  const priceFeePercent = sum(fees.filter((f) => f.kind === 'price_percent').map((f) => f.value));
  const taxPercent = sum(fees.filter((f) => f.kind === 'tax_added').map((f) => f.value));

  const batchCost = sum([subtotal, costFees]);
  const unitCost = divide(batchCost, qty);

  // Price for one piece.
  let unitPrice: Micro | null = null;
  const p = input.pricing;
  if (p.method === 'manual') {
    unitPrice = p.unitPrice;
  } else if (p.method === 'markup') {
    unitPrice = multiply(unitCost, sum([ONE, divide(p.percent, HUNDRED)]));
  } else {
    const left = ONE - divide(sum([p.percent, priceFeePercent]), HUNDRED);
    if (left <= 0) warnings.push({ code: 'margin_too_high' });
    else unitPrice = divide(unitCost, left);
  }
  if (unitPrice !== null) unitPrice = roundToCents(unitPrice);

  const unitPriceFees = unitPrice === null ? 0 : percentOf(unitPrice, priceFeePercent);
  const unitTax = unitPrice === null ? 0 : percentOf(unitPrice, taxPercent);
  const unitProfit = unitPrice === null ? null : unitPrice - unitPriceFees - unitCost;
  if (unitProfit !== null && unitProfit < 0) warnings.push({ code: 'below_cost' });

  return {
    currency: input.currency,
    quantity,
    hours,
    sections: { filament, materials, energy, labor, machine, risk, fees: costFees },
    kwh,
    machineRate,
    lines: { filament: filamentLines, materials: materialLines, labor: laborLines, fees: feeLines },
    batchCost,
    unitCost,
    price: unitPrice === null ? null : { unit: unitPrice, batch: multiply(unitPrice, qty) },
    priceFees: { unit: unitPriceFees, batch: multiply(unitPriceFees, qty) },
    profit: unitProfit === null ? null : { unit: unitProfit, batch: multiply(unitProfit, qty) },
    marginPercent:
      unitProfit === null || !unitPrice ? null : multiply(divide(unitProfit, unitPrice), HUNDRED),
    markupPercent:
      unitProfit === null || unitCost <= 0 ? null : multiply(divide(unitProfit, unitCost), HUNDRED),
    taxAdded: { unit: unitTax, batch: multiply(unitTax, qty) },
    customerPays:
      unitPrice === null
        ? null
        : { unit: sum([unitPrice, unitTax]), batch: multiply(sum([unitPrice, unitTax]), qty) },
    complete,
    warnings,
  };
}
