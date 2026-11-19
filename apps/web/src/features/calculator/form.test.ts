import { calculate, type CompanySettingsView, type PrinterView } from '@printbi/shared';
import { describe, expect, it } from 'vitest';
import { emptyForm, fromSaved, parsePayload, toPayload } from './form';

const M = 1_000_000;

const settings = {
  currency: { defaultCurrency: 'CAD', brlPerCad: null, rateUpdatedAt: null },
  calculator: {
    energyPricePerKwh: { amount: 0.15 * M, currency: 'CAD' },
    laborRatePerHour: { amount: 25 * M, currency: 'CAD' },
    targetMarginPercent: 40 * M,
    riskPercent: 5 * M,
    riskBase: 'filament',
    quoteValidityDays: 15,
    paymentTerms: '',
    reviewedAt: null,
  },
} as unknown as CompanySettingsView;

const printer = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
  name: 'P1S',
  status: 'active',
  powerWatts: 150,
  costPerHour: { amount: 0.5 * M, currency: 'CAD' },
  purchaseCost: null,
  recovery: null,
} as unknown as PrinterView;

const ctx = { items: [], printers: [printer], brlPerCad: null };

describe('calculator form', () => {
  it('starts from the calculator defaults and the first printer', () => {
    const form = emptyForm(settings, [printer]);
    expect(form.pricing).toMatchObject({ method: 'margin', percent: '40' });
    expect(form.energy).toMatchObject({ enabled: true, watts: '150', price: '0.15' });
    expect(form.machine).toMatchObject({
      enabled: true,
      mode: 'printer',
      printerId: 'aaaaaaaaaaaaaaaaaaaaaaa1',
    });
    expect(form.risk).toMatchObject({ enabled: true, percent: '5', base: 'filament' });
  });

  it('turns the typed form into the engine input, with empty fields as zero', () => {
    const form = emptyForm(settings, [printer]);
    form.hours = '4';
    form.labor.lines[0]!.hours = '1';
    const parsed = parsePayload(toPayload(form, ctx));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const result = calculate(parsed.data);
    expect(result.sections.energy).toBe(0.09 * M);
    expect(result.sections.machine).toBe(2 * M);
    expect(result.sections.labor).toBe(25 * M);
  });

  it('accepts a comma as the decimal separator', () => {
    const form = emptyForm(settings, [printer]);
    form.energy.price = '0,2';
    const parsed = parsePayload(toPayload(form, ctx));
    expect(parsed.success && parsed.data.energy.pricePerKwh.amount).toBe(0.2 * M);
  });

  it('opens a saved calculation back into the same values', () => {
    const form = emptyForm(settings, [printer]);
    form.quantity = '10';
    form.basis = 'batch';
    form.hours = '2';
    form.minutes = '30';
    form.pricing = { method: 'manual', percent: '', unitPrice: '12.5' };
    const parsed = parsePayload(toPayload(form, ctx));
    if (!parsed.success) throw new Error('invalid');
    const reopened = fromSaved({ name: 'Batch', notes: '', product: null, input: parsed.data });
    expect(reopened).toMatchObject({
      quantity: '10',
      basis: 'batch',
      hours: '2',
      minutes: '30',
      pricing: { method: 'manual', unitPrice: '12.5' },
    });
    const again = parsePayload(toPayload(reopened, ctx));
    expect(again.success && calculate(again.data).price).toEqual(calculate(parsed.data).price);
  });
});
