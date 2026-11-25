import {
  parseDecimal,
  quoteTotals,
  toDecimalString,
  type CalculationView,
  type CompanySettingsView,
  type Currency,
  type ProductView,
  type QuoteInputForm,
  type QuoteLanguage,
  type QuoteView,
} from '@printbi/shared';

/** The quote form keeps numbers as typed text; `toPayload` makes the API body from it. */

let keySeq = 0;
const newKey = () => `q-${Date.now().toString(36)}-${++keySeq}`;

export interface LineRow {
  key: string;
  productId: string;
  calculationId: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
  /** Pieces the linked calculation covers (micro); a different quantity hides its breakdown. */
  calcQuantity: number | null;
}

export interface TaxRow {
  key: string;
  label: string;
  percent: string;
}

export interface QuoteForm {
  title: string;
  language: QuoteLanguage;
  currency: Currency;
  issuedAt: string;
  validUntil: string;
  customerId: string;
  customer: { name: string; company: string; email: string; phone: string; address: string };
  lines: LineRow[];
  discount: string;
  delivery: string;
  taxes: TaxRow[];
  showBreakdown: boolean;
  leadTime: string;
  deliveryMethod: string;
  paymentTerms: string;
  notes: string;
  privateNotes: string;
}

const dec = (micro: number | null | undefined) =>
  micro === null || micro === undefined || micro === 0 ? '' : toDecimalString(micro);
const num = (text: string) => {
  const t = text.trim().replace(',', '.');
  return t === '' ? '0' : t;
};

/** YYYY-MM-DD in the person's own time zone. */
export function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const lineRow = (extra: Partial<LineRow> = {}): LineRow => ({
  key: newKey(),
  productId: '',
  calculationId: '',
  description: '',
  quantity: '1',
  unit: '',
  unitPrice: '',
  discount: '',
  calcQuantity: null,
  ...extra,
});

export const taxRow = (): TaxRow => ({ key: newKey(), label: '', percent: '' });

const UNIT_LABELS: Record<ProductView['saleUnit'], { 'pt-BR': string; en: string }> = {
  unit: { 'pt-BR': 'un.', en: 'pcs' },
  hour: { 'pt-BR': 'h', en: 'h' },
  service: { 'pt-BR': 'serviço', en: 'job' },
  custom: { 'pt-BR': '', en: '' },
};

export function lineFromProduct(product: ProductView, language: QuoteLanguage): LineRow {
  return lineRow({
    productId: product.id,
    description: product.name,
    unit:
      product.saleUnit === 'custom' ? product.customUnit : UNIT_LABELS[product.saleUnit][language],
    unitPrice: dec(product.price?.amount),
  });
}

export function lineFromCalculation(calc: CalculationView): LineRow {
  return lineRow({
    calculationId: calc.id,
    productId: calc.product?.id ?? '',
    description: calc.name,
    quantity: String(calc.quantity),
    unitPrice: dec(calc.result.price?.unit),
    calcQuantity: calc.quantity * 1_000_000,
  });
}

/** A new quote, with validity and payment terms from the calculator defaults. */
export function emptyQuote(settings: CompanySettingsView): QuoteForm {
  return {
    title: '',
    language: 'pt-BR',
    currency: settings.currency.defaultCurrency,
    issuedAt: localDate(),
    validUntil: settings.calculator.quoteValidityDays
      ? localDate(settings.calculator.quoteValidityDays)
      : '',
    customerId: '',
    customer: { name: '', company: '', email: '', phone: '', address: '' },
    lines: [lineRow()],
    discount: '',
    delivery: '',
    taxes: [],
    showBreakdown: false,
    leadTime: '',
    deliveryMethod: '',
    paymentTerms: settings.calculator.paymentTerms,
    notes: '',
    privateNotes: '',
  };
}

export function fromQuote(q: QuoteView): QuoteForm {
  return {
    title: q.title,
    language: q.language,
    currency: q.currency,
    issuedAt: q.issuedAt,
    validUntil: q.validUntil ?? '',
    customerId: q.customerId ?? '',
    customer: q.customer,
    lines: q.lines.map((l) =>
      lineRow({
        productId: l.productId ?? '',
        calculationId: l.calculationId ?? '',
        description: l.description,
        quantity: toDecimalString(l.quantity),
        unit: l.unit,
        unitPrice: toDecimalString(l.unitPrice),
        discount: dec(l.discount),
        calcQuantity: l.breakdownQuantity,
      }),
    ),
    discount: dec(q.discount),
    delivery: dec(q.delivery),
    taxes: q.taxes.map((t) => ({
      key: newKey(),
      label: t.label,
      percent: toDecimalString(t.percent),
    })),
    showBreakdown: q.showBreakdown,
    leadTime: q.leadTime,
    deliveryMethod: q.deliveryMethod,
    paymentTerms: q.paymentTerms,
    notes: q.notes,
    privateNotes: q.privateNotes,
  };
}

export function toPayload(form: QuoteForm): QuoteInputForm {
  return {
    title: form.title,
    language: form.language,
    currency: form.currency,
    issuedAt: form.issuedAt,
    validUntil: form.validUntil || null,
    customerId: form.customerId || null,
    customer: form.customer,
    lines: form.lines.map((l) => ({
      productId: l.productId || null,
      calculationId: l.calculationId || null,
      description: l.description,
      quantity: num(l.quantity),
      unit: l.unit,
      unitPrice: num(l.unitPrice),
      discount: num(l.discount),
    })),
    discount: num(form.discount),
    delivery: num(form.delivery),
    taxes: form.taxes
      .filter((t) => t.label.trim() || t.percent.trim())
      .map((t) => ({ label: t.label, percent: num(t.percent) })),
    showBreakdown: form.showBreakdown,
    leadTime: form.leadTime,
    deliveryMethod: form.deliveryMethod,
    paymentTerms: form.paymentTerms,
    notes: form.notes,
    privateNotes: form.privateNotes,
  };
}

/** Live totals, with the same rounding the server and the PDF use; null while a number is invalid. */
export function liveTotals(form: QuoteForm) {
  try {
    const n = (text: string) => parseDecimal(num(text));
    return quoteTotals({
      lines: form.lines.map((l) => ({
        quantity: n(l.quantity),
        unitPrice: n(l.unitPrice),
        discount: n(l.discount),
      })),
      discount: n(form.discount),
      delivery: n(form.delivery),
      taxes: form.taxes.map((t) => ({ percent: n(t.percent) })),
    });
  } catch {
    return null;
  }
}
