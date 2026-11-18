import { describe, expect, it } from 'vitest';
import { normalizePrinter, slugify } from './normalize';

const entry = {
  manufacturer: 'Annex Engineering',
  model: 'K3',
  technology: 'FDM',
  specs: {
    build_volume_mm: { x: 180, y: 180, z: 180 },
    nozzle_diameter_mm: 0.4,
    max_speed_mm_s: 300,
    power_w: 300,
    heater_power_w: 250,
  },
  cost: { typical_price_eur: 900, maintenance_eur_year: 60 },
  temperatures: { typical_bed_temp: 100, typical_nozzle_temp: 280 },
  sources: ['ignored'],
  contributed_by: 'ignored',
};

describe('normalizePrinter', () => {
  it('keeps only the fields PrintBI uses', () => {
    expect(normalizePrinter(entry)).toEqual({
      slug: 'annex-engineering-k3',
      brand: 'Annex Engineering',
      model: 'K3',
      buildVolumeMm: { x: 180, y: 180, z: 180 },
      buildVolumeCm3: 5832,
      nozzleDiameterMm: 0.4,
      maxSpeedMmS: 300,
      ratedPowerW: 300,
      heaterPowerW: 250,
      typicalNozzleTempC: 280,
      typicalBedTempC: 100,
      typicalPriceEur: 900,
      maintenanceEurPerYear: 60,
    });
  });

  it('skips resin and SLS printers', () => {
    expect(normalizePrinter({ ...entry, technology: 'SLA' })).toBeNull();
  });

  it('fixes brands spelled several ways and product lines filed as brands', () => {
    expect(
      normalizePrinter({ ...entry, manufacturer: 'Elegoo Neptune', model: '4 Max' }),
    ).toMatchObject({
      brand: 'Elegoo',
      model: 'Neptune 4 Max',
    });
    expect(normalizePrinter({ ...entry, manufacturer: 'Creality K1', model: '' })).toMatchObject({
      brand: 'Creality',
      model: 'K1',
    });
    expect(normalizePrinter({ ...entry, manufacturer: 'Voron Design' })?.brand).toBe('Voron');
    expect(normalizePrinter({ ...entry, manufacturer: 'Flashforge' })?.brand).toBe('FlashForge');
  });

  it('turns missing or invalid numbers into null', () => {
    const printer = normalizePrinter({
      ...entry,
      specs: { power_w: -1 },
      temperatures: {},
      cost: { typical_price_eur: 'cheap' },
    });
    expect(printer).toMatchObject({
      buildVolumeMm: null,
      buildVolumeCm3: null,
      ratedPowerW: null,
      typicalNozzleTempC: null,
      typicalPriceEur: null,
    });
  });

  it('drops entries without a brand or model', () => {
    expect(normalizePrinter({ ...entry, model: '' })).toBeNull();
  });

  it('slugifies accents and symbols', () => {
    expect(slugify('Qidi X-Max 3 Ç')).toBe('qidi-x-max-3-c');
  });
});
