import { describe, expect, it } from 'vitest';
import { FILAMENT_COLORS, findColor, HEX_COLOR, searchColors } from './colors';

describe('filament color catalog', () => {
  it('covers the spectrum, including the special finishes', () => {
    expect(FILAMENT_COLORS.length).toBeGreaterThan(150);
    for (const name of [
      'Silk Gold',
      'Hot Pink',
      'Fluorescent Green',
      'Glow Green',
      'Clear',
      'Rainbow',
      'Walnut',
    ]) {
      expect(FILAMENT_COLORS.some((c) => c.name === name)).toBe(true);
    }
  });

  it('has unique keys and valid swatches', () => {
    const keys = FILAMENT_COLORS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const color of FILAMENT_COLORS) {
      expect(color.stops.length).toBeGreaterThan(0);
      color.stops.forEach((stop) => expect(stop).toMatch(HEX_COLOR));
    }
  });

  it('gives multi-color filaments several stops', () => {
    expect(findColor('silk-gold-and-silver')?.stops).toEqual(['#D4A537', '#C0C4C8']);
    expect(findColor('rainbow')?.stops.length).toBe(6);
  });

  it('searches by name, family and finish', () => {
    expect(searchColors('silk gold').map((c) => c.name)).toContain('Silk Gold');
    expect(searchColors('neon').every((c) => c.finish === 'neon')).toBe(true);
    expect(searchColors('pink matte').map((c) => c.name)).toEqual(['Matte Pink']);
    expect(searchColors('')).toHaveLength(FILAMENT_COLORS.length);
  });
});
