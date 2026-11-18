import { toDecimalString, type InventoryItemView } from '@printbi/shared';

const MICRO = 1_000_000;
const grouped = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 3 });

type UnitInfo = Pick<InventoryItemView, 'unit' | 'customUnit'>;

/** Label for an item's unit, e.g. "g", "units", "m". */
export function unitLabel({ unit, customUnit }: UnitInfo, plural = true): string {
  if (unit === 'custom') return customUnit || 'units';
  if (unit === 'unit') return plural ? 'units' : 'unit';
  return unit;
}

/** "750 g", "1,000 g", "100 units". Quantities arrive in micro-units. */
export function showQuantity(micro: number, info: UnitInfo): string {
  return `${grouped.format(micro / MICRO)} ${unitLabel(info, micro !== MICRO)}`;
}

/** Large filament totals read better in kilograms: "12.4 kg". */
export function showGrams(micro: number): string {
  const grams = micro / MICRO;
  return grams >= 10_000 ? `${grouped.format(grams / 1000)} kg` : `${grouped.format(grams)} g`;
}

/** Micro-units back to the plain decimal a form field edits. */
export const quantityField = (micro: number): string => toDecimalString(micro);
