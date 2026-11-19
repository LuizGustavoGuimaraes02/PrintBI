import type { UnrecordedLotView } from '@printbi/shared';
import { describe, expect, it } from 'vitest';
import { groupPurchases } from './UnrecordedExpenses';

const lot = (lotId: string, store: string, day: string | null, currency: 'CAD' | 'BRL' = 'CAD') =>
  ({
    itemId: 'aaaaaaaaaaaaaaaaaaaaaaa1',
    lotId,
    itemName: 'PLA Black',
    kind: 'filament',
    lotLabel: `Roll ${lotId}`,
    purchasedAt: day ? `${day}T00:00:00.000Z` : null,
    store,
    totalCost: { amount: 20_000_000, currency },
  }) satisfies UnrecordedLotView;

describe('groupPurchases', () => {
  it('puts rolls from the same day, store and currency in one expense', () => {
    const groups = groupPurchases([
      lot('1', 'Amazon', '2026-11-10'),
      lot('2', 'amazon ', '2026-11-10'),
      lot('3', 'Amazon', '2026-11-11'),
      lot('4', 'Amazon', '2026-11-10', 'BRL'),
      lot('5', '', null),
    ]);
    expect(groups.map((g) => g.lots.map((l) => l.lotId))).toEqual([
      ['1', '2'],
      ['3'],
      ['4'],
      ['5'],
    ]);
  });
});
