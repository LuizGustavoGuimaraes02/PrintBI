/**
 * Order rules shared by the API and the web app: manual ordering on the board, when a card
 * is late or needs a nudge, and when a finished card leaves the active board.
 */
import type { BlockReason, OrderStatus, OrderType, PaymentStatus } from './schemas/order';

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------------------------
// Manual ordering: fractional ranks
// ---------------------------------------------------------------------------------------------

/** Rank digits in ascending byte order, so plain string comparison sorts them (JS and Mongo). */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** A key strictly between a and b ('' is the start, null the end). Keys never end in '0'. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? '0') === b[n]) n += 1;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const low = a ? DIGITS.indexOf(a[0] as string) : 0;
  const high = b !== null ? DIGITS.indexOf(b[0] as string) : DIGITS.length;
  if (high - low > 1) return DIGITS[Math.round((low + high) / 2)] as string;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return (DIGITS[low] as string) + midpoint(a.slice(1), null);
}

/**
 * A rank that sorts between two neighbours. Moving a card writes only its own rank, so a
 * column never has to be renumbered. Equal or crossed neighbours (two people dropping cards
 * at once) fall back to "just after `before`".
 */
export function rankBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) return midpoint(before, null);
  return midpoint(before ?? '', after);
}

// ---------------------------------------------------------------------------------------------
// Late cards
// ---------------------------------------------------------------------------------------------

const isOpen = (status: OrderStatus) => status !== 'completed' && status !== 'cancelled';

/** Past its due date and not finished. Set by the dates, never chosen by hand. */
export function isOverdue(order: { status: OrderStatus; dueDate: string | null }, today: string) {
  return order.dueDate !== null && order.dueDate < today && isOpen(order.status);
}

/** Whole days between two YYYY-MM-DD dates. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * The suggested order for a list: late cards first, then the nearest deadlines, then cards
 * with no deadline, each group in its manual board order.
 */
export function suggestedOrder(
  a: { status: OrderStatus; dueDate: string | null; rank: string },
  b: { status: OrderStatus; dueDate: string | null; rank: string },
  today: string,
): number {
  const group = (o: typeof a) => (isOverdue(o, today) ? 0 : o.dueDate ? 1 : 2);
  return (
    group(a) - group(b) ||
    (a.dueDate ?? '').localeCompare(b.dueDate ?? '') ||
    (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0)
  );
}

// ---------------------------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------------------------

export interface ReminderThresholds {
  enabled: boolean;
  quoteWaitingDays: number;
  approvedNotStartedDays: number;
  inProgressDays: number;
  blockedDays: number;
  printedDays: number;
}

type ThresholdKey = Exclude<keyof ReminderThresholds, 'enabled'>;

/** Which threshold watches each column. Columns without one (Done) never remind. */
export const REMINDER_THRESHOLD: Partial<Record<OrderStatus, ThresholdKey>> = {
  todo: 'approvedNotStartedDays',
  in_progress: 'inProgressDays',
  ready: 'printedDays',
};

/** A flagged card waits on someone: the customer's flags use the quote threshold. */
const FLAG_THRESHOLD: Record<BlockReason, ThresholdKey> = {
  quote_approval: 'quoteWaitingDays',
  waiting_customer: 'quoteWaitingDays',
  material_missing: 'blockedDays',
  printer_issue: 'blockedDays',
  print_failure: 'blockedDays',
  other: 'blockedDays',
};

export interface ReminderClock {
  status: OrderStatus;
  /** When the card entered its column. Editing a typo or opening the card never moves it. */
  statusEnteredAt: Date;
  /** "Contacted": a real follow-up with the customer. */
  lastContactAt: Date | null;
  /** Real progress, such as recording what a print used. */
  lastProgressAt: Date | null;
  snoozedUntil: Date | null;
  /** A flag on the card: it reminds by its own threshold, counted from when it was set. */
  blocked?: { reason: BlockReason; since: Date } | null;
}

export interface StaleReminder {
  /** Whole days since the last meaningful change. */
  days: number;
  threshold: number;
}

/** A card that has sat in its column longer than the company allows, unless snoozed. */
export function staleReminder(
  clock: ReminderClock,
  settings: ReminderThresholds,
  now: Date,
): StaleReminder | null {
  const flagged = clock.blocked && clock.status !== 'completed' && clock.status !== 'cancelled';
  const key = flagged ? FLAG_THRESHOLD[clock.blocked!.reason] : REMINDER_THRESHOLD[clock.status];
  if (!settings.enabled || !key) return null;
  if (clock.snoozedUntil && clock.snoozedUntil > now) return null;
  const since = Math.max(
    clock.statusEnteredAt.getTime(),
    flagged ? clock.blocked!.since.getTime() : 0,
    clock.lastContactAt?.getTime() ?? 0,
    clock.lastProgressAt?.getTime() ?? 0,
  );
  const threshold = settings[key];
  const days = Math.floor((now.getTime() - since) / DAY_MS);
  return days >= threshold ? { days, threshold } : null;
}

// ---------------------------------------------------------------------------------------------
// Board retention
// ---------------------------------------------------------------------------------------------

/**
 * Done for the board: completed, and for a sale also paid (or nothing to pay). Gifts and
 * personal jobs are done when completed.
 */
export function isSettled(order: {
  status: OrderStatus;
  type: OrderType;
  paymentStatus: PaymentStatus;
}): boolean {
  if (order.status !== 'completed') return false;
  return (
    order.type !== 'sale' ||
    order.paymentStatus === 'paid' ||
    order.paymentStatus === 'not_required'
  );
}

/**
 * When the retention clock started: kept while the card stays done, set now when it
 * becomes done, cleared when it is reopened or the payment goes back from Paid.
 */
export function nextSettledAt(previous: Date | null, settled: boolean, now: Date): Date | null {
  if (!settled) return null;
  return previous ?? now;
}

/** Cards that became done before this moment are off the active board. */
export function boardCutoff(retentionDays: number, now: Date): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

export function isHiddenFromBoard(
  settledAt: Date | null,
  retentionDays: number,
  now: Date,
): boolean {
  return settledAt !== null && settledAt <= boardCutoff(retentionDays, now);
}
