import type {
  BlockReason,
  LegacyStatus,
  OrderCardView,
  OrderPriority,
  OrderStatus,
  OrderType,
  PaymentStatus,
} from '@printbi/shared';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  todo: 'To do',
  in_progress: 'Printing',
  ready: 'Ready',
  completed: 'Done',
  cancelled: 'Cancelled',
};

/** Old columns, as they still appear in the history of orders made before the change. */
export const HISTORY_LABEL: Record<OrderStatus | LegacyStatus, string> = {
  ...STATUS_LABEL,
  quote_draft: 'Quote draft',
  waiting: 'Waiting for customer',
  blocked: 'Blocked',
  printed: 'Printed',
};

export const TYPE_LABEL: Record<OrderType, string> = {
  sale: 'Sale',
  gift: 'Gift',
  personal: 'Personal',
};

export const PRIORITY_LABEL: Record<OrderPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Partly paid',
  paid: 'Paid',
  not_required: 'No payment',
};

/** What a flagged card is waiting for, as its flag reads. */
export const BLOCK_LABEL: Record<BlockReason, string> = {
  quote_approval: 'Waiting for quote approval',
  waiting_customer: 'Waiting for the customer',
  material_missing: 'Waiting for filament',
  printer_issue: 'Printer needs a fix',
  print_failure: 'Print failed, redo it',
  other: 'Waiting for something else',
};

/** The same reasons, short, for a "Waiting for" picker. */
export const HOLD_OPTION: Record<BlockReason, string> = {
  quote_approval: 'Quote approval',
  waiting_customer: 'The customer',
  material_missing: 'Filament',
  printer_issue: 'A printer fix',
  print_failure: 'A reprint',
  other: 'Something else',
};

/** What a stale card in each column asks for. */
export const STALE_HINT: Partial<Record<OrderStatus, string>> = {
  todo: 'Not started yet',
  in_progress: 'Printing for a while: check it',
  ready: 'Ready, not delivered yet',
};

/** A stale flagged card asks about its flag instead. */
export const STALE_FLAG_HINT: Record<BlockReason, string> = {
  quote_approval: 'No reply yet: follow up',
  waiting_customer: 'No reply yet: follow up',
  material_missing: 'Still waiting for filament',
  printer_issue: 'Printer still needs a fix',
  print_failure: 'Redo still pending',
  other: 'Still waiting',
};

const dayFormat = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeZone: 'UTC' });
const shortDay = new Intl.DateTimeFormat('en-CA', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const momentFormat = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' });

/** A YYYY-MM-DD calendar day. */
export const showDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));
export const showShortDay = (day: string) => shortDay.format(new Date(`${day}T00:00:00Z`));
/** A moment (ISO timestamp) in the viewer's time zone. */
export const showMoment = (iso: string) => momentFormat.format(new Date(iso));

/** "2 h 30 min", "45 min". */
export function showMinutes(total: number | null): string {
  if (total === null) return '—';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h && `${h} h`, (m || !h) && `${m} min`].filter(Boolean).join(' ');
}

/** The deadline in words: late, due soon, or none. */
export function deadlineText(card: Pick<OrderCardView, 'dueDate' | 'overdue'>, today: string) {
  if (!card.dueDate) return 'No deadline';
  const days = Math.round(
    (Date.parse(`${card.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (card.overdue) return days === -1 ? '1 day late' : `${-days} days late`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due ${showShortDay(card.dueDate)}`;
}
