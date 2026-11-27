import {
  saleTotals,
  toMicro,
  type Currency,
  type PaymentMethod,
  type SaleCustomerKind,
  type SaleDraftView,
  type SaleInputForm,
  type SaleProduction,
  type SaleView,
} from '@printbi/shared';
import { toField } from '../../lib/money';

export interface SaleLineForm {
  key: number;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  estimatedCost: string;
}

/** The sale form as the person edits it: plain strings, turned into the API body on save. */
export interface SaleForm {
  saleDate: string;
  customerKind: SaleCustomerKind;
  customerId: string;
  customerName: string;
  sourceId: string;
  currency: Currency;
  lines: SaleLineForm[];
  discount: string;
  delivery: string;
  costs: { key: number; label: string; amount: string }[];
  production: SaleProduction;
  notes: string;
  quoteId: string;
  orderId: string;
  /** New sales only: money received right away. */
  receivedNow: string;
  receivedMethod: PaymentMethod;
}

let nextKey = 1;
export const newKey = () => nextKey++;

export const emptyLine = (): SaleLineForm => ({
  key: newKey(),
  productId: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  discount: '',
  estimatedCost: '',
});

export function emptySale(today: string, currency: Currency): SaleForm {
  return {
    saleDate: today,
    customerKind: 'unknown',
    customerId: '',
    customerName: '',
    sourceId: '',
    currency,
    lines: [emptyLine()],
    discount: '',
    delivery: '',
    costs: [],
    production: 'to_start',
    notes: '',
    quoteId: '',
    orderId: '',
    receivedNow: '',
    receivedMethod: 'transfer',
  };
}

const field = (micro: number | null | undefined) => (micro ? toField(micro) : '');

export function fromSale(sale: SaleView): SaleForm {
  return {
    ...emptySale(sale.saleDate, sale.currency),
    customerKind: sale.customer.kind,
    customerId: sale.customer.customerId ?? '',
    customerName: sale.customer.kind === 'name' ? sale.customer.name : '',
    sourceId: sale.source?.id ?? '',
    lines: sale.lines.map((l) => ({
      key: newKey(),
      productId: l.productId ?? '',
      description: l.description,
      quantity: toField(l.quantity),
      unitPrice: toField(l.unitPrice),
      discount: field(l.discount),
      estimatedCost: l.estimatedCost === null ? '' : toField(l.estimatedCost),
    })),
    discount: field(sale.discount),
    delivery: field(sale.delivery),
    costs: sale.costs.map((c) => ({ key: newKey(), label: c.label, amount: toField(c.amount) })),
    production: sale.manualProduction,
    notes: sale.notes,
    quoteId: sale.quote?.id ?? '',
    orderId: sale.order?.id ?? '',
  };
}

export function fromDraft(view: SaleDraftView, today: string): SaleForm {
  const { draft } = view;
  const base = emptySale(today, draft.currency);
  return {
    ...base,
    customerKind: draft.customer.kind,
    customerId: draft.customer.customerId ?? '',
    customerName: draft.customer.kind === 'name' ? draft.customer.name : '',
    lines: draft.lines.length
      ? draft.lines.map((l) => ({
          key: newKey(),
          productId: l.productId ?? '',
          description: l.description,
          quantity: toField(l.quantity),
          unitPrice: field(l.unitPrice),
          discount: field(l.discount),
          estimatedCost: l.estimatedCost === null ? '' : toField(l.estimatedCost),
        }))
      : base.lines,
    discount: field(draft.discount),
    delivery: field(draft.delivery),
    quoteId: draft.quoteId ?? '',
    orderId: draft.orderId ?? '',
  };
}

const decimal = (value: string) => value.trim().replace(',', '.');

/** A decimal typed in a field as micro-units, or 0 when it is empty or not a number yet. */
export function microOf(value: string): number {
  try {
    return decimal(value) ? toMicro(decimal(value)) : 0;
  } catch {
    return 0;
  }
}

/** Live totals while typing; the server works them out again on save. */
export const liveTotals = (form: SaleForm) =>
  saleTotals({
    lines: form.lines.map((l) => ({
      quantity: microOf(l.quantity),
      unitPrice: microOf(l.unitPrice),
      discount: microOf(l.discount),
    })),
    discount: microOf(form.discount),
    delivery: microOf(form.delivery),
  });

export function toPayload(form: SaleForm, isNew: boolean): SaleInputForm {
  return {
    saleDate: form.saleDate,
    customer: {
      kind: form.customerKind,
      customerId: form.customerKind === 'customer' ? form.customerId || null : null,
      name: form.customerKind === 'name' ? form.customerName : '',
    },
    sourceId: form.sourceId || null,
    currency: form.currency,
    lines: form.lines.map((l) => ({
      productId: l.productId || null,
      description: l.description,
      quantity: decimal(l.quantity),
      unitPrice: decimal(l.unitPrice) || '0',
      discount: decimal(l.discount) || '0',
      estimatedCost: decimal(l.estimatedCost) || null,
    })),
    discount: decimal(form.discount) || '0',
    delivery: decimal(form.delivery) || '0',
    costs: form.costs
      .filter((c) => c.label.trim() || c.amount.trim())
      .map((c) => ({ label: c.label, amount: decimal(c.amount) })),
    production: form.production,
    notes: form.notes,
    quoteId: isNew ? form.quoteId || null : null,
    orderId: isNew ? form.orderId || null : null,
    receipts:
      isNew && decimal(form.receivedNow)
        ? [
            {
              amount: decimal(form.receivedNow),
              receivedAt: form.saleDate,
              method: form.receivedMethod,
            },
          ]
        : [],
  } as SaleInputForm;
}
