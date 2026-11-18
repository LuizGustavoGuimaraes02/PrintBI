import { describe, expect, it } from 'vitest';
import { normalizeFilament, normalizeType } from './normalize';

describe('filament catalog normalization', () => {
  it('keeps FDM filaments with the fields PrintBI uses', () => {
    expect(
      normalizeFilament({
        brand: 'Bambu Lab',
        product: 'PLA Basic',
        type: 'PLA',
        technology: 'FDM',
        diameter_mm: 1.75,
        density: 1.24,
        price_eur_kg: 20,
        nozzle_min: 190,
        nozzle_max: 230,
        bed_min: 0,
        bed_max: 65,
      }),
    ).toEqual({
      slug: 'bambu-lab-pla-basic-pla',
      brand: 'Bambu Lab',
      product: 'PLA Basic',
      type: 'PLA',
      diameterMm: 1.75,
      densityGcm3: 1.24,
      nozzleTempMin: 190,
      nozzleTempMax: 230,
      bedTempMin: 0,
      bedTempMax: 65,
      priceEurPerKg: 20,
    });
  });

  it('skips resins', () => {
    expect(
      normalizeFilament({ brand: 'Elegoo', product: 'ABS-Like', type: 'Resin', technology: 'SLA' }),
    ).toBeNull();
  });

  it('normalizes material type spellings', () => {
    expect(normalizeType('PLA-wood')).toBe('PLA-Wood');
    expect(normalizeType('petg-cf')).toBe('PETG-CF');
    expect(normalizeType('Nylon-CF')).toBe('Nylon-CF');
    expect(normalizeType('co-polyester')).toBe('Co-polyester');
  });
});
