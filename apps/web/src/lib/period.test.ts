import { describe, expect, it } from 'vitest';
import { rangeFor, rangeQuery } from './period';

const now = new Date(2026, 10, 18); // 18 Nov 2026

describe('period ranges', () => {
  it('covers whole calendar months and years', () => {
    expect(rangeFor('this-month', {}, now)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(rangeFor('last-month', {}, now)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(rangeFor('last-3-months', {}, now)).toEqual({ from: '2026-09-01', to: '2026-11-30' });
    expect(rangeFor('last-year', {}, now)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('handles January going back a year', () => {
    expect(rangeFor('last-month', {}, new Date(2026, 0, 10))).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('includes the whole last day in the query', () => {
    expect(rangeQuery({ from: '2026-11-01', to: '2026-11-30' }).toString()).toBe(
      'from=2026-11-01T00%3A00%3A00&to=2026-11-30T23%3A59%3A59.999',
    );
    expect(rangeFor('all', {}, now)).toEqual({});
  });
});
