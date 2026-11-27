import type { CostBasis, PaymentMethod, SalePayment, SaleProductionView } from '@printbi/shared';

export const PAYMENT_LABEL: Record<SalePayment, string> = {
  unpaid: 'Unpaid',
  partial: 'Partly paid',
  paid: 'Paid',
};

export const PRODUCTION_LABEL: Record<SaleProductionView, string> = {
  to_start: 'To start',
  in_production: 'In production',
  ready: 'Ready',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  credit: 'Credit card',
  debit: 'Debit card',
  transfer: 'Transfer',
  other: 'Other',
};

/** How sure the profit is: from recorded stock use, from the estimate, or without materials. */
export const BASIS_LABEL: Record<CostBasis, string> = {
  recorded: 'recorded costs',
  estimated: 'estimated',
  none: 'no material cost yet',
};

/** Costs a business often pays for a sale, offered as one-tap names. */
export const COST_SUGGESTIONS = [
  'Shipping we paid',
  'Platform fee',
  'Card fee',
  'Packaging',
  'Labor',
];
