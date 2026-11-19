import {
  calcInputSchema,
  machineRatePerHour,
  toDecimalString,
  type CalcInput,
  type CalcInputForm,
  type CompanySettingsView,
  type Currency,
  type FeeKind,
  type InventoryItemView,
  type PricingMethod,
  type PrinterView,
} from '@printbi/shared';

/**
 * The calculator form keeps numbers as typed text. `toPayload` turns it into the input the
 * shared engine and the API expect, so the result updates live and the server recomputes the
 * very same thing when it is saved.
 */

let keySeq = 0;
export const newKey = () => `row-${Date.now().toString(36)}-${++keySeq}`;

export interface FilamentRow {
  key: string;
  source: 'stock' | 'manual';
  itemId: string;
  lotId: string;
  label: string;
  grams: string;
  spoolGrams: string;
  spoolPrice: string;
  spoolCurrency: Currency;
}

export interface MaterialRow {
  key: string;
  source: 'stock' | 'manual';
  itemId: string;
  lotId: string;
  label: string;
  quantity: string;
  unitPrice: string;
  currency: Currency;
}

export interface LaborRow {
  key: string;
  label: string;
  hours: string;
  minutes: string;
  rate: string;
}

export interface FeeRow {
  key: string;
  label: string;
  kind: FeeKind;
  value: string;
}

export interface CalcForm {
  name: string;
  productId: string;
  notes: string;
  currency: Currency;
  quantity: string;
  basis: 'unit' | 'batch';
  hours: string;
  minutes: string;
  filament: { enabled: boolean; lines: FilamentRow[] };
  energy: { enabled: boolean; watts: string; price: string };
  labor: { enabled: boolean; lines: LaborRow[] };
  machine: {
    enabled: boolean;
    mode: 'printer' | 'rate' | 'recovery';
    printerId: string;
    rate: string;
    purchase: string;
    years: string;
    daysPerYear: string;
    hoursPerDay: string;
    maintenanceKind: 'amount' | 'percent';
    maintenance: string;
  };
  materials: { enabled: boolean; lines: MaterialRow[] };
  risk: { enabled: boolean; percent: string; base: 'filament' | 'materials' | 'total' };
  fees: { enabled: boolean; lines: FeeRow[] };
  pricing: { method: PricingMethod; percent: string; unitPrice: string };
  updateProductCost: boolean;
}

const dec = (micro: number | null | undefined) =>
  micro === null || micro === undefined ? '' : toDecimalString(micro);
/** Empty text counts as zero, so a half-filled form still shows a result. */
const num = (text: string) => {
  const t = text.trim().replace(',', '.');
  return t === '' ? '0' : t;
};

export const filamentRow = (
  extra: Partial<FilamentRow> = {},
  currency: Currency = 'CAD',
): FilamentRow => ({
  key: newKey(),
  source: 'stock',
  itemId: '',
  lotId: '',
  label: '',
  grams: '',
  spoolGrams: '1000',
  spoolPrice: '',
  spoolCurrency: currency,
  ...extra,
});

export const materialRow = (currency: Currency): MaterialRow => ({
  key: newKey(),
  source: 'manual',
  itemId: '',
  lotId: '',
  label: '',
  quantity: '1',
  unitPrice: '',
  currency,
});

export const laborRow = (label: string, rate: string): LaborRow => ({
  key: newKey(),
  label,
  hours: '',
  minutes: '',
  rate,
});

export const feeRow = (): FeeRow => ({
  key: newKey(),
  label: '',
  kind: 'price_percent',
  value: '',
});

/** A fresh calculation, filled with the company's calculator defaults and first printer. */
export function emptyForm(settings: CompanySettingsView, printers: PrinterView[]): CalcForm {
  const c = settings.calculator;
  const currency = settings.currency.defaultCurrency;
  const printer = printers.find((p) => p.status === 'active') ?? printers[0];
  const laborRate = dec(c.laborRatePerHour.amount);
  return {
    name: '',
    productId: '',
    notes: '',
    currency,
    quantity: '1',
    basis: 'unit',
    hours: '',
    minutes: '',
    filament: { enabled: true, lines: [filamentRow({}, currency)] },
    energy: {
      enabled: Boolean(printer?.powerWatts),
      watts: printer?.powerWatts ? String(printer.powerWatts) : '',
      price: dec(c.energyPricePerKwh.amount),
    },
    labor: {
      enabled: true,
      lines: [laborRow('Preparation', laborRate), laborRow('Finishing', laborRate)],
    },
    machine: {
      enabled: Boolean(printer),
      mode: printer ? 'printer' : 'rate',
      printerId: printer?.id ?? '',
      rate: '',
      purchase: '',
      years: '3',
      daysPerYear: '300',
      hoursPerDay: '8',
      maintenanceKind: 'percent',
      maintenance: '20',
    },
    materials: { enabled: false, lines: [materialRow(currency)] },
    risk: { enabled: c.riskPercent > 0, percent: dec(c.riskPercent), base: c.riskBase },
    fees: { enabled: false, lines: [feeRow()] },
    pricing: c.targetMarginPercent
      ? { method: 'margin', percent: dec(c.targetMarginPercent), unitPrice: '' }
      : { method: 'markup', percent: '100', unitPrice: '' },
    updateProductCost: false,
  };
}

/** Lots that can be picked: not archived, with their item, for the stock pickers. */
export function lotOptions(items: InventoryItemView[]) {
  return items.flatMap((item) =>
    item.lots
      .filter((lot) => lot.status !== 'archived')
      .map((lot) => ({ item, lot, value: `${item.id}:${lot.id}` })),
  );
}

/** The machine rate a printer stands for: its direct rate, or its recovery plan. */
export function printerRate(printer: PrinterView | undefined) {
  if (!printer) return null;
  if (printer.costPerHour) return printer.costPerHour;
  const r = printer.recovery;
  if (!r || !printer.purchaseCost) return null;
  const rate = machineRatePerHour({
    purchase: printer.purchaseCost.amount,
    maintenance: r.maintenance,
    years: r.years,
    daysPerYear: r.daysPerYear,
    hoursPerDay: r.hoursPerDay,
  });
  return rate === null ? null : { amount: rate, currency: printer.purchaseCost.currency };
}

interface Context {
  items: InventoryItemView[];
  printers: PrinterView[];
  brlPerCad: number | null;
}

/** The form as the engine's input (decimal strings, like the API body). */
export function toPayload(form: CalcForm, ctx: Context): CalcInputForm {
  const lotOf = (itemId: string, lotId: string) =>
    ctx.items.find((i) => i.id === itemId)?.lots.find((l) => l.id === lotId);
  const minutes = (h: string, m: string) => Math.round(Number(num(h)) * 60 + Number(num(m))) || 0;
  const printer = ctx.printers.find((p) => p.id === form.machine.printerId);
  const rate = printerRate(printer);
  const money = (amount: string, currency: Currency) => ({ amount: num(amount), currency });

  return {
    currency: form.currency,
    quantity: Math.max(1, Math.round(Number(num(form.quantity))) || 1),
    basis: form.basis,
    printMinutes: minutes(form.hours, form.minutes),
    filament: {
      enabled: form.filament.enabled,
      lines: form.filament.lines
        .filter((l) => (l.source === 'stock' ? l.lotId : true))
        .map((l) => {
          const lot = l.source === 'stock' ? lotOf(l.itemId, l.lotId) : undefined;
          return {
            source: l.source,
            itemId: l.source === 'stock' ? l.itemId : null,
            lotId: l.source === 'stock' ? l.lotId : null,
            label: l.label,
            grams: num(l.grams),
            costPerGram: lot?.unitCost
              ? { amount: dec(lot.unitCost.amount), currency: lot.unitCost.currency }
              : null,
            spoolGrams: l.source === 'manual' ? num(l.spoolGrams) : null,
            spoolPrice: l.source === 'manual' ? money(l.spoolPrice, l.spoolCurrency) : null,
            available: lot ? dec(lot.remaining) : null,
          };
        }),
    },
    energy: {
      enabled: form.energy.enabled,
      watts: num(form.energy.watts),
      pricePerKwh: money(form.energy.price, form.currency),
    },
    labor: {
      enabled: form.labor.enabled,
      lines: form.labor.lines.map((l) => ({
        label: l.label,
        minutes: minutes(l.hours, l.minutes),
        ratePerHour: money(l.rate, form.currency),
      })),
    },
    machine: {
      enabled: form.machine.enabled,
      mode: form.machine.mode,
      printerId:
        form.machine.mode === 'printer' && form.machine.printerId ? form.machine.printerId : null,
      label: printer?.name ?? '',
      ratePerHour:
        form.machine.mode === 'rate'
          ? money(form.machine.rate, form.currency)
          : form.machine.mode === 'printer' && rate
            ? { amount: dec(rate.amount), currency: rate.currency }
            : null,
      recovery:
        form.machine.mode === 'recovery'
          ? {
              purchase: money(form.machine.purchase, form.currency),
              years: num(form.machine.years),
              daysPerYear: num(form.machine.daysPerYear),
              hoursPerDay: num(form.machine.hoursPerDay),
              maintenance:
                form.machine.maintenanceKind === 'percent'
                  ? { kind: 'percent', percent: num(form.machine.maintenance) }
                  : { kind: 'amount', amount: num(form.machine.maintenance) },
            }
          : null,
    },
    materials: {
      enabled: form.materials.enabled,
      lines: form.materials.lines
        .filter((l) => (l.source === 'stock' ? l.lotId : l.label || l.unitPrice))
        .map((l) => {
          const lot = l.source === 'stock' ? lotOf(l.itemId, l.lotId) : undefined;
          return {
            source: l.source,
            itemId: l.source === 'stock' ? l.itemId : null,
            lotId: l.source === 'stock' ? l.lotId : null,
            label: l.label,
            quantity: num(l.quantity),
            unitPrice: lot?.unitCost
              ? { amount: dec(lot.unitCost.amount), currency: lot.unitCost.currency }
              : money(l.unitPrice, l.currency),
            available: lot ? dec(lot.remaining) : null,
          };
        }),
    },
    risk: { enabled: form.risk.enabled, percent: num(form.risk.percent), base: form.risk.base },
    fees: {
      enabled: form.fees.enabled,
      lines: form.fees.lines
        .filter((f) => f.value.trim())
        .map((f) => ({ label: f.label, kind: f.kind, value: num(f.value) })),
    },
    pricing: {
      method: form.pricing.method,
      percent: num(form.pricing.percent),
      unitPrice: num(form.pricing.unitPrice),
    },
    brlPerCad: ctx.brlPerCad === null ? null : dec(ctx.brlPerCad),
  };
}

/** Parses the payload with the shared schema: the engine's input, or the field problems. */
export function parsePayload(payload: CalcInputForm) {
  return calcInputSchema.safeParse(payload);
}

/** A saved calculation back into the form, to keep editing it. */
export function fromSaved(saved: {
  name: string;
  notes: string;
  product: { id: string } | null;
  input: CalcInput;
}): CalcForm {
  const i = saved.input;
  const hm = (minutes: number) => ({
    hours: minutes >= 60 ? String(Math.floor(minutes / 60)) : '',
    minutes: minutes % 60 ? String(minutes % 60) : '',
  });
  const time = hm(i.printMinutes);
  return {
    name: saved.name,
    productId: saved.product?.id ?? '',
    notes: saved.notes,
    currency: i.currency,
    quantity: String(i.quantity),
    basis: i.basis,
    hours: time.hours,
    minutes: time.minutes,
    filament: {
      enabled: i.filament.enabled,
      lines: i.filament.lines.map((l) => ({
        key: newKey(),
        source: l.source,
        itemId: l.itemId ?? '',
        lotId: l.lotId ?? '',
        label: l.source === 'manual' ? l.label : '',
        grams: dec(l.grams),
        spoolGrams: dec(l.spoolGrams) || '1000',
        spoolPrice: dec(l.spoolPrice?.amount),
        spoolCurrency: l.spoolPrice?.currency ?? i.currency,
      })),
    },
    energy: {
      enabled: i.energy.enabled,
      watts: dec(i.energy.watts),
      price: dec(i.energy.pricePerKwh.amount),
    },
    labor: {
      enabled: i.labor.enabled,
      lines: i.labor.lines.map((l) => ({
        key: newKey(),
        label: l.label,
        ...hm(l.minutes),
        rate: dec(l.ratePerHour.amount),
      })),
    },
    machine: {
      enabled: i.machine.enabled,
      mode: i.machine.mode,
      printerId: i.machine.printerId ?? '',
      rate: i.machine.mode === 'rate' ? dec(i.machine.ratePerHour?.amount) : '',
      purchase: dec(i.machine.recovery?.purchase.amount),
      years: dec(i.machine.recovery?.years) || '3',
      daysPerYear: dec(i.machine.recovery?.daysPerYear) || '300',
      hoursPerDay: dec(i.machine.recovery?.hoursPerDay) || '8',
      maintenanceKind: i.machine.recovery?.maintenance.kind ?? 'percent',
      maintenance:
        i.machine.recovery?.maintenance.kind === 'amount'
          ? dec(i.machine.recovery.maintenance.amount)
          : dec(i.machine.recovery?.maintenance.percent) || '20',
    },
    materials: {
      enabled: i.materials.enabled,
      lines: i.materials.lines.map((l) => ({
        key: newKey(),
        source: l.source,
        itemId: l.itemId ?? '',
        lotId: l.lotId ?? '',
        label: l.source === 'manual' ? l.label : '',
        quantity: dec(l.quantity),
        unitPrice: dec(l.unitPrice.amount),
        currency: l.unitPrice.currency,
      })),
    },
    risk: { enabled: i.risk.enabled, percent: dec(i.risk.percent), base: i.risk.base },
    fees: {
      enabled: i.fees.enabled,
      lines: i.fees.lines.map((f) => ({
        key: newKey(),
        label: f.label,
        kind: f.kind,
        value: dec(f.value),
      })),
    },
    pricing: {
      method: i.pricing.method,
      percent: dec(i.pricing.percent),
      unitPrice: dec(i.pricing.unitPrice) || '',
    },
    updateProductCost: false,
  };
}
