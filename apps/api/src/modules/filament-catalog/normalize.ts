/**
 * Turns one Open 3D Printer Database material into the fields PrintBI uses.
 * Pure function: used by the build script and covered by tests.
 */
import { slugify } from '../printer-catalog/normalize';

export interface CatalogFilament {
  slug: string;
  brand: string;
  product: string;
  type: string;
  diameterMm: number | null;
  densityGcm3: number | null;
  nozzleTempMin: number | null;
  nozzleTempMax: number | null;
  bedTempMin: number | null;
  bedTempMax: number | null;
  priceEurPerKg: number | null;
}

interface SourceMaterial {
  brand?: unknown;
  product?: unknown;
  type?: unknown;
  technology?: unknown;
  diameter_mm?: unknown;
  density?: unknown;
  price_eur_kg?: unknown;
  price_per_kg?: unknown;
  nozzle_min?: unknown;
  nozzle_max?: unknown;
  bed_min?: unknown;
  bed_max?: unknown;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const positive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
/** Bed temperatures can legitimately be 0 (unheated bed). */
const nonNegative = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const SUFFIXES: Record<string, string> = {
  cf: 'CF',
  gf: 'GF',
  esd: 'ESD',
  wood: 'Wood',
  metal: 'Metal',
};
const WORDS: Record<string, string> = { nylon: 'Nylon' };

/** "PLA-wood" and "PLA-Wood" become "PLA-Wood"; "petg-cf" becomes "PETG-CF". */
export function normalizeType(raw: string): string {
  if (!raw) return '';
  if (/^co-polyester$/i.test(raw)) return 'Co-polyester';
  if (/^support$/i.test(raw)) return 'Support';
  return raw
    .split('-')
    .map((part, index) =>
      index === 0
        ? (WORDS[part.toLowerCase()] ?? part.toUpperCase())
        : (SUFFIXES[part.toLowerCase()] ?? part.toUpperCase()),
    )
    .join('-');
}

export function normalizeFilament(entry: SourceMaterial): CatalogFilament | null {
  if (entry.technology !== 'FDM') return null;
  const brand = text(entry.brand);
  const product = text(entry.product);
  const type = normalizeType(text(entry.type));
  if (!brand || !product || !type) return null;

  return {
    slug: slugify(`${brand} ${product} ${type}`),
    brand,
    product,
    type,
    diameterMm: positive(entry.diameter_mm),
    densityGcm3: positive(entry.density),
    nozzleTempMin: positive(entry.nozzle_min),
    nozzleTempMax: positive(entry.nozzle_max),
    bedTempMin: nonNegative(entry.bed_min),
    bedTempMax: nonNegative(entry.bed_max),
    priceEurPerKg: positive(entry.price_eur_kg) ?? positive(entry.price_per_kg),
  };
}
