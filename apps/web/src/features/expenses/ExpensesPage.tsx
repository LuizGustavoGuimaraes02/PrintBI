import { formatMoney, type ExpenseStatus, type ExpenseView, type Money } from '@printbi/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  Badge,
  cn,
  EmptyState,
  PageHeader,
  PageLoader,
  SelectField,
  TextField,
} from '../../design-system';
import { PERIODS, rangeFor, type PeriodKey, type Range } from '../../lib/period';
import { useCan } from '../auth/account';
import { useCategories } from '../settings/queries';
import { useExpenses, useExpenseSummary, type ExpenseFilters } from './queries';
import { UnrecordedExpensesNotice } from '../inventory/UnrecordedExpenses';

const dateFormat = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeZone: 'UTC' });

export const STATUS_BADGE: Record<
  ExpenseStatus,
  { label: string; tone: 'teal' | 'hot' | 'neutral' }
> = {
  paid: { label: 'Paid', tone: 'teal' },
  partial: { label: 'Partly paid', tone: 'hot' },
  pending: { label: 'Pending', tone: 'hot' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const list = (values: Money[]) =>
  values.length ? values.map((v) => formatMoney(v)).join(' + ') : '—';

export function NoFinanceAccess() {
  return (
    <>
      <PageHeader title="Costs & Expenses" />
      <EmptyState title="Financial access needed">
        Expenses, payments and costs are visible to admins and to members the admin gives financial
        access.
      </EmptyState>
    </>
  );
}

export function ExpensesPage() {
  if (!useCan('finance:view')) return <NoFinanceAccess />;
  return <Expenses />;
}

function Expenses() {
  const canManage = useCan('finance:manage');
  const [period, setPeriod] = useState<PeriodKey>('this-month');
  const [custom, setCustom] = useState<Range>({});
  const [filters, setFilters] = useState<Omit<ExpenseFilters, keyof Range>>({
    categoryId: '',
    status: '',
    q: '',
  });
  const range = rangeFor(period, custom);
  const { data: categories = [] } = useCategories();
  const { data: summary } = useExpenseSummary(range);
  const { data: expenses, isPending } = useExpenses({ ...range, ...filters });

  const cells = [
    {
      label: 'Recorded',
      value: summary ? list(summary.recorded) : '—',
      hint: 'Purchases dated in the period',
    },
    {
      label: 'Paid',
      value: summary ? list(summary.paid) : '—',
      hint: 'Payments made in the period',
    },
    {
      label: 'Still to pay',
      value: summary ? list(summary.pending) : '—',
      hint: 'On this period’s purchases',
      attention: (summary?.pending.length ?? 0) > 0,
    },
    {
      label: 'Top category',
      value: summary?.topCategory ? summary.topCategory.name : '—',
      hint: summary?.topCategory
        ? formatMoney(summary.topCategory.amount)
        : 'In the default currency',
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Money out"
        title="Costs & Expenses"
        description="What you bought, what you paid and what is still owed."
        actions={
          canManage && (
            <Link
              to="/expenses/new"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-teal px-6 text-[15px] font-bold text-white hover:bg-teal-strong"
            >
              <Plus size={18} aria-hidden="true" /> Add expense
            </Link>
          )
        }
      />
      <UnrecordedExpensesNotice />

      <div className="flex flex-wrap items-end gap-3 px-1">
        <SelectField
          label="Period"
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodKey)}
          className="w-48"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </SelectField>
        {period === 'custom' && (
          <>
            <TextField
              label="From"
              type="date"
              value={custom.from ?? ''}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value || undefined }))}
            />
            <TextField
              label="To"
              type="date"
              value={custom.to ?? ''}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value || undefined }))}
            />
          </>
        )}
      </div>

      <section
        aria-label="Expense summary"
        className="grid rounded-[var(--radius-card)] bg-surface px-6 py-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            className={cn(
              'flex flex-col gap-1 py-2 sm:px-5',
              i === 0 && 'sm:pl-0',
              i > 0 && 'lg:border-l lg:border-rule-soft',
            )}
          >
            <span className="label-mono text-ink-muted">{cell.label}</span>
            <span
              className={cn(
                'figure text-[24px] leading-tight font-medium',
                cell.attention && 'text-hot-ink',
              )}
            >
              {cell.value}
            </span>
            <span className="text-[13px] text-ink-muted">{cell.hint}</span>
          </div>
        ))}
      </section>

      <section
        aria-label="Expenses"
        className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-surface p-5 md:p-6"
      >
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label="Search"
            placeholder="Description or vendor"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            className="min-w-56 flex-1"
          />
          <SelectField
            label="Category"
            value={filters.categoryId}
            onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}
            className="w-48"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? ' (archived)' : ''}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Status"
            value={filters.status}
            onChange={(e) =>
              setFilters((f) => ({ ...f, status: e.target.value as ExpenseStatus | '' }))
            }
            className="w-44"
          >
            <option value="">Any</option>
            <option value="pending">Pending</option>
            <option value="partial">Partly paid</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </SelectField>
        </div>

        {isPending && <PageLoader label="Loading expenses" />}
        {expenses && expenses.length === 0 && (
          <EmptyState title="No expenses in this period">
            Purchases of filament, tools, packaging and fees will show up here.
          </EmptyState>
        )}
        {expenses && expenses.length > 0 && <ExpenseTable expenses={expenses} />}
      </section>
    </>
  );
}

function ExpenseTable({ expenses }: { expenses: ExpenseView[] }) {
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[760px] border-collapse text-[14px]">
        <thead>
          <tr className="label-mono text-left text-ink-muted">
            <th className="border-b border-rule py-2 pr-3 font-medium">Date</th>
            <th className="border-b border-rule py-2 pr-3 font-medium">Description</th>
            <th className="border-b border-rule py-2 pr-3 font-medium">Category</th>
            <th className="border-b border-rule py-2 pr-3 text-right font-medium">Amount</th>
            <th className="border-b border-rule py-2 pr-3 text-right font-medium">Paid</th>
            <th className="border-b border-rule py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((e) => (
            <tr
              key={e.id}
              className={cn('hover:bg-bench', e.status === 'cancelled' && 'text-ink-muted')}
            >
              <td className="figure border-b border-rule-soft py-3 pr-3 text-[13px] whitespace-nowrap">
                {dateFormat.format(new Date(e.purchasedAt))}
              </td>
              <td className="border-b border-rule-soft py-3 pr-3">
                <Link to={`/expenses/${e.id}`} className="font-semibold hover:text-teal">
                  {e.description}
                </Link>
                <span className="block text-[13px] text-ink-muted">
                  {[e.vendor, e.stock.length > 0 && 'linked to stock'].filter(Boolean).join(' · ')}
                </span>
              </td>
              <td className="border-b border-rule-soft py-3 pr-3">{e.category.name}</td>
              <td
                className={cn(
                  'figure border-b border-rule-soft py-3 pr-3 text-right whitespace-nowrap',
                  e.status === 'cancelled' && 'line-through',
                )}
              >
                {formatMoney(e.amount)}
              </td>
              <td className="figure border-b border-rule-soft py-3 pr-3 text-right whitespace-nowrap">
                {formatMoney({ amount: e.paid, currency: e.amount.currency })}
              </td>
              <td className="border-b border-rule-soft py-3">
                <Badge tone={STATUS_BADGE[e.status].tone}>{STATUS_BADGE[e.status].label}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
