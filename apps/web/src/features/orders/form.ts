import type {
  BlockReason,
  BoardColumn,
  Currency,
  OrderDraftView,
  OrderInputForm,
  OrderPriority,
  OrderType,
  OrderView,
  PaymentStatus,
  RecipientKind,
} from '@printbi/shared';
import { toField } from '../../lib/money';

/** The order form as the person edits it: plain strings, turned into the API body on save. */
export interface OrderForm {
  title: string;
  type: OrderType;
  description: string;
  productId: string;
  quantity: string;
  labelIds: string[];
  recipientKind: RecipientKind;
  customerId: string;
  recipientName: string;
  orderDate: string;
  dueDate: string;
  plannedStart: string;
  priority: OrderPriority;
  printerId: string;
  material: string;
  colors: string;
  hours: string;
  minutes: string;
  grams: string;
  finishingNotes: string;
  modelUrl: string;
  internalNotes: string;
  currency: Currency;
  agreedPrice: string;
  estimatedCost: string;
  paymentStatus: PaymentStatus;
  quoteId: string;
  status: BoardColumn;
  /** New orders only: created already waiting for something. Afterwards it is a card action. */
  holdReason: BlockReason | '';
  /** Rolls from stock picked for the job, with the file's grams when known. */
  filaments: { itemId: string; grams: string }[];
}

export function emptyOrder(today: string, currency: Currency): OrderForm {
  return {
    title: '',
    type: 'sale',
    description: '',
    productId: '',
    quantity: '1',
    labelIds: [],
    recipientKind: 'name',
    customerId: '',
    recipientName: '',
    orderDate: today,
    dueDate: '',
    plannedStart: '',
    priority: 'normal',
    printerId: '',
    material: '',
    colors: '',
    hours: '',
    minutes: '',
    grams: '',
    finishingNotes: '',
    modelUrl: '',
    internalNotes: '',
    currency,
    agreedPrice: '',
    estimatedCost: '',
    paymentStatus: 'unpaid',
    quoteId: '',
    status: 'todo',
    holdReason: '',
    filaments: [],
  };
}

const splitMinutes = (total: number | null) =>
  total === null
    ? { hours: '', minutes: '' }
    : { hours: String(Math.floor(total / 60)), minutes: String(total % 60) };

export function fromOrder(order: OrderView, currency: Currency): OrderForm {
  return {
    ...emptyOrder(order.orderDate, order.agreedPrice?.currency ?? currency),
    title: order.title,
    type: order.type,
    description: order.description,
    productId: order.product?.id ?? '',
    quantity: String(order.quantity),
    labelIds: order.labelIds,
    recipientKind: order.recipient.kind,
    customerId: order.recipient.customerId ?? '',
    recipientName: order.recipient.kind === 'name' ? order.recipient.name : '',
    dueDate: order.dueDate ?? '',
    plannedStart: order.plannedStart ?? '',
    priority: order.priority,
    printerId: order.printer?.id ?? '',
    material: order.material,
    colors: order.colors,
    ...splitMinutes(order.estimatedMinutes),
    grams: toField(order.estimatedGrams),
    finishingNotes: order.finishingNotes,
    modelUrl: order.modelUrl,
    internalNotes: order.internalNotes,
    agreedPrice: toField(order.agreedPrice?.amount),
    estimatedCost: toField(order.estimatedCost?.amount),
    paymentStatus: order.type === 'sale' ? order.paymentStatus : 'unpaid',
    quoteId: order.quote?.id ?? '',
    status: order.status === 'cancelled' ? 'todo' : order.status,
    filaments: order.filaments.map((f) => ({ itemId: f.itemId, grams: toField(f.grams) })),
  };
}

/** A new order prefilled from an approved quote, for review before saving. */
export function fromDraft(view: OrderDraftView, today: string, currency: Currency): OrderForm {
  const { draft } = view;
  return {
    ...emptyOrder(today, draft.agreedPrice?.currency ?? currency),
    title: draft.title,
    description: draft.description,
    productId: draft.productId ?? '',
    quantity: String(draft.quantity),
    recipientKind: draft.recipient.kind,
    customerId: draft.recipient.customerId ?? '',
    recipientName: draft.recipient.kind === 'name' ? draft.recipient.name : '',
    ...splitMinutes(draft.estimatedMinutes),
    grams: draft.estimatedGrams === null ? '' : String(Math.round(draft.estimatedGrams / 1e6)),
    agreedPrice: toField(draft.agreedPrice?.amount),
    estimatedCost: toField(draft.estimatedCost?.amount),
    quoteId: view.quote.id,
  };
}

const decimal = (value: string) => value.trim().replace(',', '.');
const money = (value: string, currency: Currency) =>
  decimal(value) ? { amount: decimal(value), currency } : null;

function minutesOf(form: OrderForm): number | null {
  if (!form.hours.trim() && !form.minutes.trim()) return null;
  const h = Number(form.hours || 0);
  const m = Number(form.minutes || 0);
  return Number.isFinite(h) && Number.isFinite(m) ? Math.round(h * 60 + m) : NaN;
}

/** The API body. Sale-only fields are sent empty for gifts and personal jobs. */
export function toPayload(form: OrderForm): OrderInputForm {
  const sale = form.type === 'sale';
  return {
    title: form.title,
    type: form.type,
    description: form.description,
    productId: form.productId || null,
    quantity: form.quantity.trim() as unknown as number,
    labelIds: form.labelIds,
    recipient: {
      kind: form.recipientKind,
      customerId: form.recipientKind === 'customer' ? form.customerId || null : null,
      name: form.recipientKind === 'name' ? form.recipientName : '',
    },
    orderDate: form.orderDate,
    dueDate: form.dueDate || null,
    plannedStart: form.plannedStart || null,
    priority: form.priority,
    printerId: form.printerId || null,
    material: form.material,
    colors: form.colors,
    estimatedMinutes: minutesOf(form),
    estimatedGrams: decimal(form.grams) || null,
    finishingNotes: form.finishingNotes,
    modelUrl: form.modelUrl,
    internalNotes: form.internalNotes,
    agreedPrice: sale ? money(form.agreedPrice, form.currency) : null,
    estimatedCost: money(form.estimatedCost, form.currency),
    paymentStatus: sale ? form.paymentStatus : 'not_required',
    quoteId: sale ? form.quoteId || null : null,
    status: form.status,
    blocked: form.holdReason ? { reason: form.holdReason, note: '' } : null,
    // One roll takes the file's grams; with several, each keeps what it was given.
    filaments: form.filaments.map((f) => ({
      itemId: f.itemId,
      grams: decimal(f.grams || (form.filaments.length === 1 ? form.grams : '')) || null,
    })),
  };
}

/** Form fields a print file can fill; each one shows a "from file" tag until edited. */
/** The filament is never taken from the file: the person picks the roll they loaded. */
export const FILE_FIELDS = ['title', 'quantity', 'printerId', 'hours', 'minutes', 'grams'] as const;
export type FileField = (typeof FILE_FIELDS)[number];

interface FileValues {
  title: string;
  copies: number | null;
  printerId: string;
  minutes: number | null;
  grams: number | null;
}

/**
 * Puts what a print file says into the form. A value the person already typed stays; one an
 * earlier file filled is replaced. Returns the form and the fields the file now owns.
 */
export function applyPrintFile(
  form: OrderForm,
  file: FileValues,
  owned: ReadonlySet<FileField>,
): { form: OrderForm; owned: Set<FileField> } {
  const next = { ...form };
  const filled = new Set<FileField>();
  const free = (key: FileField, empty = '') => owned.has(key) || form[key].trim() === empty;
  const put = (key: FileField, value: string, empty = '') => {
    if (value && free(key, empty)) {
      next[key] = value;
      filled.add(key);
    }
  };
  put('title', file.title);
  put('quantity', file.copies && file.copies > 1 ? String(file.copies) : '', '1');
  put('printerId', file.printerId);
  if (file.minutes !== null && free('hours') && free('minutes')) {
    next.hours = String(Math.floor(file.minutes / 60));
    next.minutes = String(file.minutes % 60);
    filled.add('hours').add('minutes');
  }
  put('grams', file.grams === null ? '' : String(file.grams));
  // Fields the earlier file filled and this one does not are cleared, not left stale.
  for (const key of owned) {
    if (!filled.has(key)) next[key] = key === 'quantity' ? '1' : '';
  }
  return { form: next, owned: filled };
}

/** Removing the file empties what it filled and the person has not changed. */
export function clearPrintFile(form: OrderForm, owned: ReadonlySet<FileField>): OrderForm {
  const next = { ...form };
  for (const key of owned) next[key] = key === 'quantity' ? '1' : '';
  return next;
}

export const hasEstimates = (form: OrderForm) =>
  Boolean(form.hours.trim() || form.minutes.trim() || form.grams.trim());
