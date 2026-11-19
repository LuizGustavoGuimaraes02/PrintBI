import { createItemSchema } from '@printbi/shared';
import { describe, expect, it } from 'vitest';
import { emptyItem, emptyLot, formPath, suggestedName, toItemPayload, toLotPayload } from './forms';

describe('inventory forms', () => {
  it('builds a filament payload the shared schema accepts', () => {
    const item = {
      ...emptyItem('filament'),
      name: 'PLA Black',
      colorKey: 'black',
      colorName: 'Black',
    };
    const lot = { ...emptyLot('CAD', '0123456789abcdef01234567'), price: '25' };
    const payload = {
      item: toItemPayload(item),
      firstLot: toLotPayload(lot, { withCosts: true, withExpense: true }),
    };
    expect(createItemSchema.safeParse(payload).success).toBe(true);
    expect(payload.firstLot).toMatchObject({
      remaining: '1000',
      totalCost: { amount: '25', currency: 'CAD' },
      // New purchases go to Costs & Expenses unless the switch is turned off.
      expense: { categoryId: '0123456789abcdef01234567', method: 'credit' },
    });
  });

  it('uses what is left for a partly used roll', () => {
    const lot = { ...emptyLot('CAD'), partlyUsed: true, remaining: '750' };
    expect(toLotPayload(lot, { withCosts: false, withExpense: false }).remaining).toBe('750');
  });

  it('never sends costs or an expense the user may not record', () => {
    const lot = { ...emptyLot('CAD', 'x'), price: '25', recordExpense: true };
    expect(toLotPayload(lot, { withCosts: false, withExpense: false })).toMatchObject({
      totalCost: null,
      expense: null,
    });
  });

  it('maps schema paths onto form fields', () => {
    expect(formPath('item.filament.colorKey')).toBe('item.colorKey');
    expect(formPath('firstLot.totalCost.amount')).toBe('lot.price');
    expect(formPath('firstLot.remaining')).toBe('lot.remaining');
    expect(formPath('lot.expense.categoryId', 'lot')).toBe('lot.expenseCategoryId');
    expect(formPath('firstLotXremaining')).toBe('firstLotXremaining');
  });

  it('proposes a name from brand, material and color', () => {
    expect(
      suggestedName({
        ...emptyItem('filament'),
        brand: 'Bambu Lab',
        materialType: 'PLA',
        colorName: 'Black',
      }),
    ).toBe('Bambu Lab PLA Black');
  });
});

describe('suggested names with a catalog product', () => {
  it('uses the product name instead of the bare material', () => {
    expect(
      suggestedName({
        ...emptyItem('filament'),
        brand: 'Bambu Lab',
        materialType: 'PLA',
        productName: 'PLA Basic',
        colorName: 'Jet Black',
      }),
    ).toBe('Bambu Lab PLA Basic Jet Black');
  });
});
