import { formatMoney, toDecimalString, type Money } from '@printbi/shared';

/** Money for display, rounded to cents. */
export const showMoney = (value: Money | null | undefined): string =>
  value ? formatMoney(value) : '—';

/** Unit costs such as 0.025/g keep extra decimals. */
export const showUnitMoney = (value: Money | null | undefined): string =>
  value ? formatMoney(value, { precision: 'unit' }) : '—';

/** Micro-units back to the decimal string a form field edits. */
export const toField = (micro: number | null | undefined): string =>
  micro === null || micro === undefined ? '' : toDecimalString(micro);
