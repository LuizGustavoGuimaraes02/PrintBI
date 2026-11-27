import { saleInputSchema } from '@printbi/shared';
import { describe, expect, it } from 'vitest';
import { emptyLine, emptySale, liveTotals, toPayload } from './form';

const M = 1_000_000;

describe('sale form', () => {
  it('adds up live while typing, ignoring half-typed numbers', () => {
    const form = {
      ...emptySale('2026-11-25', 'CAD' as const),
      lines: [
        { ...emptyLine(), description: 'Keychain', quantity: '10', unitPrice: '10' },
        { ...emptyLine(), description: 'Stand', quantity: '2', unitPrice: '12,5', discount: '5' },
        { ...emptyLine(), description: 'Typing', quantity: '1', unitPrice: '3.' },
      ],
      discount: '10',
      delivery: '8',
    };
    expect(liveTotals(form).total).toBe(118 * M);
  });

  it('sends a quick sale the API accepts, with the money received right away', () => {
    const payload = toPayload(
      {
        ...emptySale('2026-11-25', 'CAD'),
        lines: [{ ...emptyLine(), description: 'Lamp', unitPrice: '40' }],
        costs: [
          { key: 1, label: 'Shipping we paid', amount: '6' },
          { key: 2, label: '', amount: '' },
        ],
        receivedNow: '40',
        receivedMethod: 'cash',
      },
      true,
    );
    expect(payload.costs).toEqual([{ label: 'Shipping we paid', amount: '6' }]);
    expect(payload.receipts).toEqual([{ amount: '40', receivedAt: '2026-11-25', method: 'cash' }]);
    expect(saleInputSchema.safeParse(payload).success).toBe(true);
  });

  it('never sends the links or the first receipt when editing', () => {
    const payload = toPayload(
      {
        ...emptySale('2026-11-25', 'CAD'),
        lines: [{ ...emptyLine(), description: 'Lamp', unitPrice: '40' }],
        orderId: 'a'.repeat(24),
        receivedNow: '40',
      },
      false,
    );
    expect(payload).toMatchObject({ orderId: null, quoteId: null, receipts: [] });
  });
});
