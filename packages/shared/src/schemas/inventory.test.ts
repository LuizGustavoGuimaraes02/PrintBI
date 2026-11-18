import { describe, expect, it } from 'vitest';
import { itemInputSchema, lotInputSchema } from './inventory';

describe('lot input', () => {
  it('parses quantities and money exactly', () => {
    const lot = lotInputSchema.parse({
      originalQuantity: '1000',
      remaining: '750',
      totalCost: { amount: '25', currency: 'CAD' },
    });
    expect(lot).toMatchObject({ originalQuantity: 1_000_000_000, remaining: 750_000_000 });
    expect(lot.totalCost).toEqual({ amount: 25_000_000, currency: 'CAD' });
  });

  it('refuses more left than bought', () => {
    expect(lotInputSchema.safeParse({ originalQuantity: '100', remaining: '150' }).success).toBe(
      false,
    );
  });

  it('needs a price to record the purchase as an expense', () => {
    const result = lotInputSchema.safeParse({
      originalQuantity: '1000',
      remaining: '1000',
      expense: { categoryId: '0123456789abcdef01234567' },
    });
    expect(result.success).toBe(false);
  });
});

describe('item input', () => {
  it('requires a catalog or custom color for filament', () => {
    const base = {
      kind: 'filament',
      name: 'PLA Black',
      filament: { materialType: 'PLA', colorName: 'Black' },
    };
    expect(itemInputSchema.safeParse(base).success).toBe(false);
    expect(
      itemInputSchema.safeParse({ ...base, filament: { ...base.filament, colorKey: 'black' } })
        .success,
    ).toBe(true);
    expect(
      itemInputSchema.safeParse({ ...base, filament: { ...base.filament, colorHex: '#1F2328' } })
        .success,
    ).toBe(true);
  });

  it('requires a category and unit for other consumables', () => {
    expect(itemInputSchema.safeParse({ kind: 'material', name: 'M3 screws' }).success).toBe(false);
    expect(
      itemInputSchema.safeParse({
        kind: 'material',
        name: 'M3 screws',
        category: 'Fasteners',
        unit: 'unit',
      }).success,
    ).toBe(true);
  });
});
