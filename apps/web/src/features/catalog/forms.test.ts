import { formatMoney, type ProductView } from '@printbi/shared';
import { describe, expect, it } from 'vitest';
import {
  emptyProduct,
  marginNote,
  priceText,
  productFormPath,
  productPayload,
  productToForm,
  specsText,
} from './forms';

const M = 1_000_000;

const view: ProductView = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
  type: 'product',
  name: 'Dragon keychain',
  description: '',
  labels: [{ id: 'bbbbbbbbbbbbbbbbbbbbbbb1', name: 'Keychain', color: '#E2F1F3' }],
  price: { amount: 15 * M, currency: 'BRL' },
  estimatedCost: null,
  saleUnit: 'unit',
  customUnit: '',
  specs: { widthMm: 120, depthMm: 30, heightMm: 8, filamentGrams: 24.5 * M },
  notes: '',
  archived: false,
  soldQuantity: 0,
  updatedAt: '2026-11-18T00:00:00.000Z',
};

describe('product form', () => {
  it('round-trips a product through the form', () => {
    const form = productToForm(view, 'CAD');
    expect(form).toMatchObject({
      currency: 'BRL',
      price: '15',
      labelIds: ['bbbbbbbbbbbbbbbbbbbbbbb1'],
      widthMm: '120',
      filamentGrams: '24.5',
    });
    expect(productPayload(form, true)).toMatchObject({
      price: { amount: '15', currency: 'BRL' },
      estimatedCost: null,
      specs: { widthMm: 120, depthMm: 30, heightMm: 8, filamentGrams: '24.5' },
    });
  });

  it('clears size for services and the cost for members without finance access', () => {
    const form = {
      ...emptyProduct('CAD'),
      type: 'service' as const,
      name: 'Modelling',
      widthMm: '10',
      estimatedCost: '5',
      customUnit: 'leftover',
    };
    expect(productPayload(form, false)).toMatchObject({
      estimatedCost: null,
      customUnit: '',
      specs: { widthMm: null, depthMm: null, heightMm: null, filamentGrams: null },
    });
  });

  it('maps API paths back to form fields', () => {
    expect(productFormPath('price.amount')).toBe('price');
    expect(productFormPath('specs.widthMm')).toBe('widthMm');
    expect(productFormPath('customUnit')).toBe('customUnit');
  });

  it('describes the margin in words', () => {
    expect(marginNote('15', '3.40')).toBe('Margin 77.3% of the price.');
    expect(marginNote('10', '5')).toBe('Margin 50% of the price.');
    expect(marginNote('3', '4')).toBe('The price is below the estimated cost.');
    expect(marginNote('', '4')).toBeNull();
    expect(marginNote('abc', '1')).toBeNull();
  });

  it('formats price and specs for the list', () => {
    const brl = formatMoney({ amount: 15 * M, currency: 'BRL' });
    expect(priceText(view)).toBe(`${brl} / piece`);
    expect(priceText({ ...view, saleUnit: 'custom', customUnit: 'set of 4' })).toBe(
      `${brl} / set of 4`,
    );
    expect(priceText({ ...view, price: null })).toBe('No set price');
    expect(specsText(view.specs)).toBe('120 × 30 × 8 mm · 24.5 g of filament');
    expect(specsText({ ...view.specs, heightMm: null, filamentGrams: null })).toBe('');
  });
});
