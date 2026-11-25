import { quoteInputSchema, type CompanySettingsView } from '@printbi/shared';
import { describe, expect, it } from 'vitest';
import { emptyQuote, lineRow, liveTotals, localDate, toPayload } from './form';

const M = 1_000_000;
const settings = {
  currency: { defaultCurrency: 'CAD', brlPerCad: null },
  calculator: { quoteValidityDays: 15, paymentTerms: '50% upfront' },
} as unknown as CompanySettingsView;

describe('quote form', () => {
  it('starts with validity and payment terms from the calculator defaults', () => {
    const form = emptyQuote(settings);
    expect(form.validUntil).toBe(localDate(15));
    expect(form.paymentTerms).toBe('50% upfront');
    expect(form.currency).toBe('CAD');
  });

  it('adds up live with the shared rounding, accepting a comma', () => {
    const form = emptyQuote(settings);
    form.lines = [
      lineRow({ description: 'Keychain', quantity: '10', unitPrice: '12,5', discount: '5' }),
    ];
    form.delivery = '15';
    form.taxes = [{ key: 't', label: 'HST', percent: '13' }];
    const totals = liveTotals(form);
    expect(totals?.lines).toEqual([120 * M]);
    expect(totals?.total).toBe(152.55 * M);
  });

  it('builds a body the API schema accepts, leaving out blank taxes', () => {
    const form = emptyQuote(settings);
    form.customer.name = 'Ana';
    form.lines = [lineRow({ description: 'Vase', quantity: '2', unitPrice: '30' })];
    form.taxes = [{ key: 't', label: '', percent: '' }];
    const parsed = quoteInputSchema.safeParse(toPayload(form));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.taxes).toEqual([]);
  });

  it('returns no totals while a number is invalid', () => {
    const form = emptyQuote(settings);
    form.lines = [lineRow({ quantity: 'abc' })];
    expect(liveTotals(form)).toBeNull();
  });
});
