import { formatMoney, MICRO_PER_UNIT, type PublicProductCardView } from '@printbi/shared';
import type { ShowcaseStrings } from './strings';

/** "From C$15.00 / hour", or null when the business keeps the price private. */
export function priceLine(product: PublicProductCardView, t: ShowcaseStrings): string | null {
  if (!product.price) return null;
  const amount = formatMoney(product.price, { locale: t.locale, display: 'symbol' });
  const unit = product.saleUnit === 'custom' ? product.customUnit : t.units[product.saleUnit];
  const per = product.saleUnit === 'unit' || !unit ? '' : ` / ${unit}`;
  return `${t.from} ${amount}${per}`;
}

const number = (value: number, locale: string, digits = 1) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);

/** "120 × 30 × 8 mm", skipping measurements that were left empty. */
export function sizeLine(product: PublicProductCardView, t: ShowcaseStrings): string | null {
  const { widthMm, depthMm, heightMm } = product.specs;
  const parts = [widthMm, depthMm, heightMm].filter((v): v is number => v !== null);
  if (parts.length === 0) return null;
  return `${parts.map((v) => number(v, t.locale)).join(' × ')} mm`;
}

/** Filament weight is stored in micro-units of a gram. */
export function filamentLine(product: PublicProductCardView, t: ShowcaseStrings): string | null {
  const grams = product.specs.filamentGrams;
  return grams === null ? null : `${number(grams / MICRO_PER_UNIT, t.locale)} g`;
}

/** Accent- and case-insensitive text for search. */
export const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * A link typed by the business, made safe for a public page: only http(s), with https://
 * added when it was left out ("instagram.com/shop"). Anything else is dropped.
 */
export function safeUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
