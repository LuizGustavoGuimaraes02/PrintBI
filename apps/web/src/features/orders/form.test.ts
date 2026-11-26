import { orderInputSchema, type OrderDraftView } from '@printbi/shared';
import { describe, expect, it } from 'vitest';
import {
  applyPrintFile,
  clearPrintFile,
  emptyOrder,
  fromDraft,
  toPayload,
  type FileField,
} from './form';

const M = 1_000_000;

describe('order form', () => {
  it('a personal job sends no price, payment or quote', () => {
    const form = {
      ...emptyOrder('2026-11-24', 'CAD' as const),
      title: 'Drawer repair piece',
      type: 'personal' as const,
      recipientKind: 'myself' as const,
      agreedPrice: '30',
      quoteId: 'a'.repeat(24),
    };
    const payload = toPayload(form);
    expect(payload).toMatchObject({
      agreedPrice: null,
      paymentStatus: 'not_required',
      quoteId: null,
      recipient: { kind: 'myself', customerId: null, name: '' },
    });
    expect(orderInputSchema.safeParse(payload).success).toBe(true);
  });

  it('turns hours and minutes into minutes and keeps decimals as strings', () => {
    const payload = toPayload({
      ...emptyOrder('2026-11-24', 'CAD'),
      title: 'Spice rack',
      recipientName: 'Mom',
      hours: '2',
      minutes: '30',
      grams: '120,5',
      agreedPrice: '45',
      dueDate: '2026-11-30',
    });
    expect(payload).toMatchObject({
      estimatedMinutes: 150,
      estimatedGrams: '120.5',
      agreedPrice: { amount: '45', currency: 'CAD' },
      dueDate: '2026-11-30',
    });
    const parsed = orderInputSchema.parse(payload);
    expect(parsed.estimatedGrams).toBe(120.5 * M);
  });

  it('starts flagged when it is already waiting for something', () => {
    const payload = toPayload({
      ...emptyOrder('2026-11-24', 'CAD'),
      title: 'Bust',
      recipientName: 'Maria',
      holdReason: 'quote_approval',
    });
    expect(payload.blocked).toEqual({ reason: 'quote_approval', note: '' });
    expect(toPayload(emptyOrder('2026-11-24', 'CAD')).blocked).toBeNull();
  });

  it('gives the file grams to a single picked roll, not to several', () => {
    const base = { ...emptyOrder('2026-11-24', 'CAD'), title: 'Stand', grams: '86.1' };
    const one = toPayload({ ...base, filaments: [{ itemId: 'a'.repeat(24), grams: '' }] });
    expect(one.filaments).toEqual([{ itemId: 'a'.repeat(24), grams: '86.1' }]);
    const two = toPayload({
      ...base,
      filaments: [
        { itemId: 'a'.repeat(24), grams: '' },
        { itemId: 'b'.repeat(24), grams: '20' },
      ],
    });
    expect(two.filaments).toEqual([
      { itemId: 'a'.repeat(24), grams: null },
      { itemId: 'b'.repeat(24), grams: '20' },
    ]);
  });

  it('prefills from a quote with its customer, price and estimates', () => {
    const draft: OrderDraftView = {
      quote: { id: 'q'.repeat(24), code: 'ORC-0007', status: 'approved' },
      existingOrderId: null,
      draft: {
        title: 'Ten keychains',
        description: '10 pcs × Keychain',
        productId: null,
        quantity: 10,
        recipient: { kind: 'customer', customerId: 'c'.repeat(24), name: 'Bruno' },
        agreedPrice: { amount: 100 * M, currency: 'BRL' },
        estimatedCost: { amount: 31.3 * M, currency: 'BRL' },
        estimatedMinutes: 125,
        estimatedGrams: 240 * M,
      },
    };
    const form = fromDraft(draft, '2026-11-24', 'CAD');
    expect(form).toMatchObject({
      quoteId: draft.quote.id,
      currency: 'BRL',
      agreedPrice: '100',
      estimatedCost: '31.3',
      hours: '2',
      minutes: '5',
      grams: '240',
      recipientKind: 'customer',
      customerId: 'c'.repeat(24),
    });
  });
});

describe('filling the order from a print file', () => {
  const file = {
    title: 'Phone stand',
    copies: 5,
    printerId: 'p1s',
    minutes: 160,
    grams: 86.1,
  };

  it('fills empty fields and marks them as from the file', () => {
    const { form, owned } = applyPrintFile(emptyOrder('2026-11-25', 'CAD'), file, new Set());
    expect(form).toMatchObject({
      title: 'Phone stand',
      quantity: '5',
      printerId: 'p1s',
      material: '',
      colors: '',
      hours: '2',
      minutes: '40',
      grams: '86.1',
    });
    expect([...owned].sort()).toEqual(
      ['grams', 'hours', 'minutes', 'printerId', 'quantity', 'title'].sort(),
    );
  });

  it('never overwrites what the person typed', () => {
    const typed = { ...emptyOrder('2026-11-25', 'CAD'), title: 'Stands for João', quantity: '2' };
    const { form, owned } = applyPrintFile(typed, file, new Set());
    expect(form.title).toBe('Stands for João');
    expect(form.quantity).toBe('2');
    expect(owned.has('title')).toBe(false);
  });

  it('a second file replaces the first one and clears what it no longer says', () => {
    const first = applyPrintFile(emptyOrder('2026-11-25', 'CAD'), file, new Set());
    const second = applyPrintFile(
      first.form,
      { ...file, title: 'Clip', copies: null, printerId: '', minutes: null, grams: null },
      first.owned,
    );
    expect(second.form).toMatchObject({
      title: 'Clip',
      quantity: '1',
      printerId: '',
      hours: '',
      minutes: '',
      grams: '',
    });
  });

  it('removing the file empties only the fields it still owns', () => {
    const { form, owned } = applyPrintFile(emptyOrder('2026-11-25', 'CAD'), file, new Set());
    const edited = new Set<FileField>(owned);
    edited.delete('title');
    const cleared = clearPrintFile({ ...form, title: 'My title' }, edited);
    expect(cleared).toMatchObject({ title: 'My title', quantity: '1', printerId: '', grams: '' });
  });
});
