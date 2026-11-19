import type { PublicProductCardView } from '@printbi/shared';
import { describe, expect, it } from 'vitest';
import { filamentLine, plain, priceLine, safeUrl, sizeLine } from './format';
import { stringsFor } from './strings';

const card = (extra: Partial<PublicProductCardView> = {}): PublicProductCardView => ({
  slug: 'dragon',
  type: 'product',
  name: 'Dragão articulado',
  description: '',
  labels: [],
  badge: 'ready',
  featured: false,
  price: { amount: 15_000_000, currency: 'BRL' },
  saleUnit: 'unit',
  customUnit: '',
  specs: { widthMm: 120, depthMm: 30, heightMm: 8.5, filamentGrams: 24_500_000 },
  cover: null,
  imageCount: 0,
  ...extra,
});

const pt = stringsFor('pt-BR');
const en = stringsFor('en');

describe('public showcase formatting', () => {
  it('writes the price as "from", with the unit when it is not per piece', () => {
    expect(priceLine(card(), pt)).toMatch(/^A partir de R\$\s?15,00$/);
    expect(priceLine(card({ saleUnit: 'hour' }), en)).toMatch(/^From R\$15\.00 \/ hour$/);
    expect(priceLine(card({ saleUnit: 'custom', customUnit: 'kit' }), pt)).toContain('/ kit');
    expect(priceLine(card({ price: null }), pt)).toBeNull();
  });

  it('writes size and filament in the showcase language', () => {
    expect(sizeLine(card(), pt)).toBe('120 × 30 × 8,5 mm');
    expect(sizeLine(card({ specs: { ...card().specs, depthMm: null } }), en)).toBe('120 × 8.5 mm');
    expect(filamentLine(card(), pt)).toBe('24,5 g');
  });

  it('searches without accents or case', () => {
    expect(plain('Dragão ARTICULADO')).toBe('dragao articulado');
  });

  it('keeps only http(s) links and adds https:// when it was left out', () => {
    expect(safeUrl('instagram.com/layerlab')).toBe('https://instagram.com/layerlab');
    expect(safeUrl('http://example.com')).toBe('http://example.com/');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
    expect(safeUrl('  ')).toBeNull();
  });
});
