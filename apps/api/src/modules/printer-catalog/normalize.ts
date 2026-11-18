/**
 * Turns one Open 3D Printer Database entry into the few fields PrintBI uses.
 * Pure function: used by the build script and covered by tests.
 */

export interface CatalogPrinter {
  slug: string;
  brand: string;
  model: string;
  buildVolumeMm: { x: number; y: number; z: number } | null;
  buildVolumeCm3: number | null;
  nozzleDiameterMm: number | null;
  maxSpeedMmS: number | null;
  ratedPowerW: number | null;
  heaterPowerW: number | null;
  typicalNozzleTempC: number | null;
  typicalBedTempC: number | null;
  typicalPriceEur: number | null;
  maintenanceEurPerYear: number | null;
}

interface SourceEntry {
  manufacturer?: unknown;
  model?: unknown;
  technology?: unknown;
  specs?: {
    build_volume_mm?: { x?: unknown; y?: unknown; z?: unknown };
    build_volume_cm3?: unknown;
    nozzle_diameter_mm?: unknown;
    max_speed_mm_s?: unknown;
    power_w?: unknown;
    heater_power_w?: unknown;
  };
  cost?: { typical_price_eur?: unknown; maintenance_eur_year?: unknown };
  temperatures?: { typical_nozzle_temp?: unknown; typical_bed_temp?: unknown };
}

/** Brands spelled several ways, or product lines filed as brands, in the source. */
const BRAND_FIXES: Record<string, { brand: string; modelPrefix?: string }> = {
  'Voron Design': { brand: 'Voron' },
  Flashforge: { brand: 'FlashForge' },
  'Elegoo Neptune': { brand: 'Elegoo', modelPrefix: 'Neptune' },
  'Creality K1': { brand: 'Creality', modelPrefix: 'K1' },
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** A positive finite number, or null for anything missing or nonsensical. */
const positive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function normalizePrinter(entry: SourceEntry): CatalogPrinter | null {
  if (entry.technology !== 'FDM') return null;

  const sourceBrand = text(entry.manufacturer);
  const fix = BRAND_FIXES[sourceBrand];
  const brand = fix?.brand ?? sourceBrand;
  const rawModel = text(entry.model);
  const model = fix?.modelPrefix ? [fix.modelPrefix, rawModel].filter(Boolean).join(' ') : rawModel;
  if (!brand || !model) return null;

  const specs = entry.specs ?? {};
  const volume = specs.build_volume_mm;
  const x = positive(volume?.x);
  const y = positive(volume?.y);
  const z = positive(volume?.z);

  return {
    slug: slugify(`${brand} ${model}`),
    brand,
    model,
    buildVolumeMm: x && y && z ? { x, y, z } : null,
    buildVolumeCm3:
      positive(specs.build_volume_cm3) ?? (x && y && z ? Math.round((x * y * z) / 1000) : null),
    nozzleDiameterMm: positive(specs.nozzle_diameter_mm),
    maxSpeedMmS: positive(specs.max_speed_mm_s),
    ratedPowerW: positive(specs.power_w),
    heaterPowerW: positive(specs.heater_power_w),
    typicalNozzleTempC: positive(entry.temperatures?.typical_nozzle_temp),
    typicalBedTempC: positive(entry.temperatures?.typical_bed_temp),
    typicalPriceEur: positive(entry.cost?.typical_price_eur),
    maintenanceEurPerYear: positive(entry.cost?.maintenance_eur_year),
  };
}

/** How many optional fields an entry fills: the richer one wins when slugs collide. */
export const filledFields = (p: CatalogPrinter): number =>
  Object.values(p).filter((value) => value !== null).length;
