/** Date ranges for period filters. Dates are local calendar days as YYYY-MM-DD. */
export const PERIODS = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'last-3-months', label: 'Last 3 months' },
  { value: 'this-year', label: 'This year' },
  { value: 'last-year', label: 'Last year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
] as const;
export type PeriodKey = (typeof PERIODS)[number]['value'];

export interface Range {
  from?: string;
  to?: string;
}

const day = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function rangeFor(period: PeriodKey, custom: Range = {}, now = new Date()): Range {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'this-month':
      return { from: day(new Date(y, m, 1)), to: day(new Date(y, m + 1, 0)) };
    case 'last-month':
      return { from: day(new Date(y, m - 1, 1)), to: day(new Date(y, m, 0)) };
    case 'last-3-months':
      return { from: day(new Date(y, m - 2, 1)), to: day(new Date(y, m + 1, 0)) };
    case 'this-year':
      return { from: day(new Date(y, 0, 1)), to: day(new Date(y, 11, 31)) };
    case 'last-year':
      return { from: day(new Date(y - 1, 0, 1)), to: day(new Date(y - 1, 11, 31)) };
    case 'custom':
      return custom;
    default:
      return {};
  }
}

/** Query string for a range; `to` includes the whole last day. */
export function rangeQuery(range: Range): URLSearchParams {
  const params = new URLSearchParams();
  if (range.from) params.set('from', `${range.from}T00:00:00`);
  if (range.to) params.set('to', `${range.to}T23:59:59.999`);
  return params;
}
