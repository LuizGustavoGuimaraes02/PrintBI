import {
  formatMoney,
  SALE_PAYMENT,
  SALE_PRODUCTION,
  type Money,
  type SaleListItemView,
} from '@printbi/shared';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Badge,
  cn,
  EmptyState,
  FilterPill,
  Hint,
  PageHeader,
  PageLoader,
  Panel,
} from '../../design-system';
import { PERIODS, rangeFor, type PeriodKey } from '../../lib/period';
import { useCan } from '../auth/account';
import { NoFinanceAccess } from '../expenses/ExpensesPage';
import { showShortDay } from '../orders/labels';
import { BASIS_LABEL, PAYMENT_LABEL, PRODUCTION_LABEL } from './labels';
import { useSales } from './queries';

const FILTER_KEYS = ['q', 'payment', 'production', 'estimated', 'cancelled'] as const;

const money = (list: Money[]) =>
  list.length
    ? list.map((m) => formatMoney(m)).join(' + ')
    : formatMoney({ amount: 0, currency: 'CAD' });

export function SalesPage() {
  if (!useCan('finance:view')) return <NoFinanceAccess />;
  return <Sales />;
}

function Sales() {
  const canManage = useCan('finance:manage');
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState<PeriodKey>('this-month');
  const get = (key: string) => params.get(key) ?? '';
  const update = (patch: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );

  const query = useMemo(() => {
    const range = rangeFor(period === 'custom' ? 'all' : period);
    const q: Record<string, string> = {};
    if (range.from) q.from = range.from;
    if (range.to) q.to = range.to;
    for (const key of FILTER_KEYS) if (params.get(key)) q[key] = params.get(key)!;
    if (!q.cancelled) q.cancelled = 'false';
    if (q.cancelled === 'all') delete q.cancelled;
    return q;
  }, [params, period]);
  const { data } = useSales(query);
  const s = data?.summary;

  return (
    <>
      <PageHeader
        title="Sales & Profit"
        actions={
          canManage && (
            <Link
              to="/sales/new"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-teal px-6 text-[15px] font-bold text-white hover:bg-teal-strong"
            >
              <Plus size={18} aria-hidden="true" /> Register sale
            </Link>
          )
        }
      />

      {s && (
        <p className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[15px] text-ink-muted">
          <span className="relative inline-flex items-center">
            <select
              aria-label="Period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodKey)}
              className="cursor-pointer appearance-none border-0 bg-transparent pr-5 font-semibold text-ink outline-none"
            >
              {PERIODS.filter((p) => p.value !== 'custom').map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute right-0 text-ink-muted"
            />
          </span>
          <span>
            <span className="figure font-medium text-ink">{s.count}</span> sales
          </span>
          <Hint text="The total of the sales listed, cancelled ones left out.">
            <span tabIndex={0}>
              sold <span className="figure font-medium text-ink">{money(s.sold)}</span>
            </span>
          </Hint>
          <span>
            received <span className="figure font-medium text-ink">{money(s.received)}</span>
          </span>
          {s.receivable.some((m) => m.amount > 0) && (
            <span className="font-semibold text-hot-ink">
              to receive <span className="figure">{money(s.receivable)}</span>
            </span>
          )}
          <Hint text="Total minus material cost (recorded stock use, or the estimate until then) and the costs entered on each sale.">
            <span tabIndex={0}>
              profit <span className="figure font-medium text-ink">{money(s.profit)}</span>
              {s.estimated > 0 && <span className="text-[13px]"> ({s.estimated} estimated)</span>}
            </span>
          </Hint>
        </p>
      )}

      <Panel className="gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-11 w-full min-w-0 items-center gap-2 rounded-full border-[1.5px] border-rule px-4 focus-within:border-teal sm:w-auto sm:max-w-80 sm:flex-1">
            <Search size={17} aria-hidden="true" className="shrink-0 text-steel" />
            <span className="sr-only">Search sales</span>
            <input
              type="search"
              value={get('q')}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Customer, item or VEN number"
              className="h-full min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          <FilterPill
            label="Payment"
            value={get('payment')}
            onChange={(v) => update({ payment: v })}
          >
            {SALE_PAYMENT.map((p) => (
              <option key={p} value={p}>
                {PAYMENT_LABEL[p]}
              </option>
            ))}
          </FilterPill>
          <FilterPill
            label="Production"
            value={get('production')}
            onChange={(v) => update({ production: v })}
          >
            {SALE_PRODUCTION.map((p) => (
              <option key={p} value={p}>
                {PRODUCTION_LABEL[p]}
              </option>
            ))}
          </FilterPill>
          <FilterPill
            label="Costs"
            value={get('estimated')}
            onChange={(v) => update({ estimated: v })}
          >
            <option value="true">Still estimated</option>
            <option value="false">Recorded</option>
          </FilterPill>
          <FilterPill
            label="Show"
            value={get('cancelled')}
            onChange={(v) => update({ cancelled: v })}
            empty="Active"
          >
            <option value="true">Cancelled</option>
            <option value="all">Everything</option>
          </FilterPill>
        </div>

        {!data ? (
          <PageLoader label="Loading sales" />
        ) : data.sales.length === 0 ? (
          <EmptyState
            title="No sales here"
            action={
              canManage && (
                <Link to="/sales/new" className="font-semibold text-teal">
                  Register a sale
                </Link>
              )
            }
          >
            Sales from orders, quotes or the counter all land here.
          </EmptyState>
        ) : (
          <SaleRows sales={data.sales} />
        )}
      </Panel>
    </>
  );
}

function SaleRows({ sales }: { sales: SaleListItemView[] }) {
  return (
    <ul className="flex flex-col divide-y divide-rule-soft">
      {sales.map((sale) => (
        <li key={sale.id}>
          <Link
            to={`/sales/${sale.id}`}
            className={cn(
              'grid gap-x-4 gap-y-1 rounded-[var(--radius-tile)] px-2 py-3 hover:bg-bench sm:grid-cols-[96px_minmax(0,1fr)_auto]',
              sale.cancelled && 'opacity-60',
            )}
          >
            <span className="flex flex-row items-baseline gap-2 sm:flex-col sm:gap-0.5">
              <span className="figure text-[14px] font-semibold">{sale.code}</span>
              <span className="figure text-[12px] text-ink-muted">
                {showShortDay(sale.saleDate)}
              </span>
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <strong className="truncate text-[15px]">
                {sale.customer.name || 'Walk-in customer'}
              </strong>
              <span className="truncate text-[13px] text-ink-muted">{sale.items}</span>
              <span className="flex flex-wrap gap-1.5 pt-0.5">
                <Badge
                  tone={
                    sale.payment === 'paid'
                      ? 'teal'
                      : sale.payment === 'partial'
                        ? 'neutral'
                        : 'hot'
                  }
                >
                  {PAYMENT_LABEL[sale.payment]}
                </Badge>
                <Badge>{PRODUCTION_LABEL[sale.production]}</Badge>
              </span>
            </span>
            <span className="flex flex-row items-baseline justify-between gap-3 sm:flex-col sm:items-end sm:gap-0.5">
              <span className="figure text-[16px] font-semibold">
                {formatMoney({ amount: sale.total, currency: sale.currency })}
              </span>
              {sale.outstanding > 0 && !sale.cancelled && (
                <span className="figure text-[12px] text-hot-ink">
                  {formatMoney({ amount: sale.outstanding, currency: sale.currency })} to receive
                </span>
              )}
              <span className="figure text-[12px] text-ink-muted">
                profit {formatMoney({ amount: sale.profit.profit, currency: sale.currency })}
                {sale.profit.basis !== 'recorded' && ` · ${BASIS_LABEL[sale.profit.basis]}`}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
