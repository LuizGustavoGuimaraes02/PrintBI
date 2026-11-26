import { describe, expect, it } from 'vitest';
import {
  boardCutoff,
  isHiddenFromBoard,
  isOverdue,
  isSettled,
  nextSettledAt,
  rankBetween,
  staleReminder,
  suggestedOrder,
  type ReminderThresholds,
} from './orders';
import { orderHoldSchema, orderInputSchema, orderMoveSchema } from './schemas/order';

const DAY = 86_400_000;

describe('rankBetween', () => {
  it('sorts between its neighbours as plain strings', () => {
    const first = rankBetween(null, null);
    const after = rankBetween(first, null);
    const before = rankBetween(null, first);
    const middle = rankBetween(first, after);
    expect(before < first && first < middle && middle < after).toBe(true);
  });

  it('keeps finding room when cards are dropped into the same gap again and again', () => {
    let low = rankBetween(null, null);
    const high = rankBetween(low, null);
    for (let i = 0; i < 200; i += 1) {
      const next = rankBetween(low, high);
      expect(next > low && next < high).toBe(true);
      expect(next.endsWith('0')).toBe(false);
      low = next;
    }
    let top = high;
    for (let i = 0; i < 200; i += 1) {
      const next = rankBetween(null, top);
      expect(next < top).toBe(true);
      top = next;
    }
  });

  it('falls back to "after" when two cards share a rank', () => {
    expect(rankBetween('V', 'V') > 'V').toBe(true);
    expect(rankBetween('a', 'V') > 'a').toBe(true);
  });
});

describe('isOverdue', () => {
  it('flags an open card past its due date, by the dates alone', () => {
    expect(isOverdue({ status: 'in_progress', dueDate: '2026-11-20' }, '2026-11-21')).toBe(true);
    expect(isOverdue({ status: 'ready', dueDate: '2026-11-20' }, '2026-11-21')).toBe(true);
  });
  it('never flags the due day itself, a finished card or a card without a deadline', () => {
    expect(isOverdue({ status: 'todo', dueDate: '2026-11-21' }, '2026-11-21')).toBe(false);
    expect(isOverdue({ status: 'completed', dueDate: '2026-11-01' }, '2026-11-21')).toBe(false);
    expect(isOverdue({ status: 'cancelled', dueDate: '2026-11-01' }, '2026-11-21')).toBe(false);
    expect(isOverdue({ status: 'todo', dueDate: null }, '2026-11-21')).toBe(false);
  });
});

describe('suggestedOrder', () => {
  it('puts late cards first, then near deadlines, then no deadline', () => {
    const today = '2026-11-21';
    const cards = [
      { id: 'none', status: 'todo' as const, dueDate: null, rank: 'A' },
      { id: 'later', status: 'todo' as const, dueDate: '2026-12-10', rank: 'B' },
      { id: 'late', status: 'todo' as const, dueDate: '2026-11-19', rank: 'C' },
      { id: 'soon', status: 'todo' as const, dueDate: '2026-11-23', rank: 'D' },
    ];
    expect(cards.sort((a, b) => suggestedOrder(a, b, today)).map((c) => c.id)).toEqual([
      'late',
      'soon',
      'later',
      'none',
    ]);
  });
});

describe('staleReminder', () => {
  const settings: ReminderThresholds = {
    enabled: true,
    quoteWaitingDays: 3,
    approvedNotStartedDays: 3,
    inProgressDays: 5,
    blockedDays: 2,
    printedDays: 3,
  };
  const now = new Date('2026-11-21T12:00:00Z');
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const clock = (status: 'todo' | 'in_progress' | 'ready' | 'completed', entered: number) => ({
    status,
    statusEnteredAt: ago(entered),
    lastContactAt: null,
    lastProgressAt: null,
    snoozedUntil: null,
  });
  const waiting = (entered: number) => ({
    ...clock('todo', entered),
    blocked: { reason: 'quote_approval' as const, since: ago(entered) },
  });

  it('reminds once a card sits in its column for the threshold', () => {
    expect(staleReminder(clock('todo', 3), settings, now)).toEqual({ days: 3, threshold: 3 });
    expect(staleReminder(clock('todo', 2), settings, now)).toBeNull();
    expect(staleReminder(clock('in_progress', 4), settings, now)).toBeNull();
    expect(staleReminder(clock('ready', 3), settings, now)).toEqual({ days: 3, threshold: 3 });
  });

  it('a flagged card reminds by its flag, counted from when the flag was set', () => {
    const material = {
      ...clock('in_progress', 10),
      blocked: { reason: 'material_missing' as const, since: ago(2) },
    };
    expect(staleReminder(material, settings, now)).toEqual({ days: 2, threshold: 2 });
    expect(
      staleReminder(
        { ...material, blocked: { ...material.blocked, since: ago(1) } },
        settings,
        now,
      ),
    ).toBeNull();
    expect(staleReminder(waiting(3), settings, now)).toEqual({ days: 3, threshold: 3 });
  });

  it('counts from the last contact or real progress, not from the column change', () => {
    expect(staleReminder({ ...waiting(6), lastContactAt: ago(1) }, settings, now)).toBe(null);
    expect(staleReminder({ ...clock('todo', 6), lastProgressAt: ago(4) }, settings, now)).toEqual({
      days: 4,
      threshold: 3,
    });
  });

  it('stays quiet while snoozed, when disabled, and in columns without a threshold', () => {
    const snoozed = { ...waiting(9), snoozedUntil: new Date(now.getTime() + DAY) };
    expect(staleReminder(snoozed, settings, now)).toBeNull();
    expect(staleReminder({ ...snoozed, snoozedUntil: ago(1) }, settings, now)).not.toBeNull();
    expect(staleReminder(waiting(9), { ...settings, enabled: false }, now)).toBeNull();
    expect(staleReminder(clock('completed', 30), settings, now)).toBeNull();
  });
});

describe('board retention', () => {
  it('a sale is done only when completed and paid; gifts when completed', () => {
    expect(isSettled({ status: 'completed', type: 'sale', paymentStatus: 'unpaid' })).toBe(false);
    expect(isSettled({ status: 'completed', type: 'sale', paymentStatus: 'partial' })).toBe(false);
    expect(isSettled({ status: 'completed', type: 'sale', paymentStatus: 'paid' })).toBe(true);
    expect(isSettled({ status: 'ready', type: 'sale', paymentStatus: 'paid' })).toBe(false);
    expect(isSettled({ status: 'completed', type: 'gift', paymentStatus: 'not_required' })).toBe(
      true,
    );
  });

  it('completed on day 1, paid on day 3: hidden from day 10 with 7 days', () => {
    const day1 = new Date('2026-11-01T10:00:00Z');
    const day3 = new Date('2026-11-03T10:00:00Z');
    // Completed but unpaid: no clock yet.
    let settledAt = nextSettledAt(null, false, day1);
    expect(settledAt).toBeNull();
    settledAt = nextSettledAt(settledAt, true, day3);
    expect(settledAt).toEqual(day3);
    // Later edits keep the original moment.
    expect(nextSettledAt(settledAt, true, new Date('2026-11-05T00:00:00Z'))).toEqual(day3);
    expect(isHiddenFromBoard(settledAt, 7, new Date('2026-11-10T09:59:00Z'))).toBe(false);
    expect(isHiddenFromBoard(settledAt, 7, new Date('2026-11-10T10:00:00Z'))).toBe(true);
    expect(boardCutoff(7, new Date('2026-11-10T10:00:00Z'))).toEqual(day3);
  });

  it('payment going back from Paid, or reopening, restarts the clock', () => {
    const day3 = new Date('2026-11-03T10:00:00Z');
    expect(nextSettledAt(day3, false, new Date('2026-11-04T00:00:00Z'))).toBeNull();
    expect(isHiddenFromBoard(null, 7, new Date('2027-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('order schemas', () => {
  const base = {
    title: 'Keychain for João',
    type: 'sale',
    quantity: 10,
    recipient: { kind: 'name', name: 'João' },
    orderDate: '2026-11-21',
  };

  it('accepts a minimal order and fills the defaults', () => {
    const parsed = orderInputSchema.parse(base);
    expect(parsed.status).toBe('todo');
    expect(parsed.priority).toBe('normal');
    expect(parsed.dueDate).toBeNull();
  });

  it('a personal job needs no customer, price or deadline', () => {
    const parsed = orderInputSchema.safeParse({
      ...base,
      type: 'personal',
      title: 'Drawer repair piece',
      recipient: { kind: 'myself' },
    });
    expect(parsed.success).toBe(true);
  });

  it('refuses a due date before the order, an old column, a roll picked twice and a quote on a gift', () => {
    expect(orderInputSchema.safeParse({ ...base, dueDate: '2026-11-01' }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...base, status: 'blocked' }).success).toBe(false);
    const roll = { itemId: 'b'.repeat(24), grams: '86.1' };
    expect(orderInputSchema.safeParse({ ...base, filaments: [roll] }).success).toBe(true);
    expect(orderInputSchema.safeParse({ ...base, filaments: [roll, roll] }).success).toBe(false);
    expect(
      orderInputSchema.safeParse({ ...base, type: 'gift', quoteId: 'a'.repeat(24) }).success,
    ).toBe(false);
    expect(orderMoveSchema.safeParse({ status: 'blocked' }).success).toBe(false);
    expect(orderMoveSchema.safeParse({ status: 'ready' }).success).toBe(true);
    expect(orderHoldSchema.safeParse({ blocked: { reason: 'quote_approval' } }).success).toBe(true);
    expect(orderHoldSchema.safeParse({ blocked: null }).success).toBe(true);
  });
});
