import {
  ORDER_PRIORITIES,
  ORDER_STATUSES,
  ORDER_TYPES,
  type BoardColumn,
  type LabelView,
  type OrderCardView,
  type OrderPriority,
  type OrderStatus,
  type OrderType,
} from '@printbi/shared';
import { ChevronDown, Columns3, List, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Button,
  cn,
  EmptyState,
  FilterPill,
  PageHeader,
  PageLoader,
  Panel,
} from '../../design-system';
import { localToday, rangeFor, type PeriodKey } from '../../lib/period';
import { useLabels, useProducts } from '../catalog/queries';
import { useCustomers } from '../customers/queries';
import { usePrinters } from '../settings/queries';
import { toField } from '../../lib/money';
import { ConsumeDialog } from '../inventory/ConsumeDialog';
import { PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL } from './labels';
import { OrderBoard } from './OrderBoard';
import { OrderList } from './OrderList';
import { OrderModal } from './OrderModal';
import { NewOrderDialog } from './NewOrderDialog';
import { useOrders } from './queries';
import { useOrderActions } from './useOrderActions';

/** Filters live in the address, so a link (from a reminder, later the dashboard) opens the same view. */
const FILTER_KEYS = [
  'q',
  'printerId',
  'type',
  'priority',
  'deadline',
  'labelId',
  'productId',
  'customerId',
  'board',
  'status',
] as const;

const COMPLETED_PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'this-month', label: 'this month' },
  { value: 'last-month', label: 'last month' },
  { value: 'this-year', label: 'this year' },
  { value: 'all', label: 'all time' },
];

function completedRange(period: PeriodKey) {
  const range = rangeFor(period);
  return {
    completedFrom: range.from ? new Date(`${range.from}T00:00:00`).toISOString() : '',
    completedTo: range.to ? new Date(`${range.to}T23:59:59.999`).toISOString() : '',
  };
}

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const today = localToday();
  const [period, setPeriod] = useState<PeriodKey>('this-month');
  const [showFilters, setShowFilters] = useState(false);
  const [adding, setAdding] = useState<BoardColumn | null>(null);
  const view = params.get('view') === 'list' ? 'list' : 'board';
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

  const deadline = get('deadline');
  const query = useMemo(() => {
    const q: Record<string, string> = { today, ...completedRange(period) };
    for (const key of FILTER_KEYS) {
      const value = params.get(key);
      if (value) q[key] = value;
    }
    if (deadline === 'overdue') {
      delete q.deadline;
      q.overdue = 'true';
    }
    // The board shows columns; a status filter only narrows the list.
    if (view === 'board') delete q.status;
    return q;
  }, [params, today, period, deadline, view]);

  const { data } = useOrders(query);
  const { data: printers = [] } = usePrinters();
  const { data: labelList = [] } = useLabels();
  const { data: products = [] } = useProducts();
  const { data: customers = [] } = useCustomers();
  const labels = useMemo(() => new Map(labelList.map((l) => [l.id, l])), [labelList]);
  const actions = useOrderActions();
  const [confirming, setConfirming] = useState<OrderCardView | null>(null);

  const filtered = FILTER_KEYS.some((key) => key !== 'q' && params.get(key)) || Boolean(get('q'));
  const open = (id: string) => update({ card: id });

  const onMove = (card: OrderCardView, status: BoardColumn, afterId: string | null) =>
    actions.move(card.id, { status, afterId }, status === card.status).then(() => undefined);

  const visiblePrinters = printers.filter((p) => p.status !== 'retired');
  const clearAll = () =>
    update(Object.fromEntries(FILTER_KEYS.map((key) => [key, ''])) as Record<string, string>);

  // What each active filter means, shown as removable chips while the filter row is closed.
  const named = (list: { id: string; name: string }[], id: string) =>
    list.find((x) => x.id === id)?.name ?? '…';
  const chips: { key: string; text: string }[] = [
    get('type') && { key: 'type', text: TYPE_LABEL[get('type') as OrderType] },
    get('priority') && {
      key: 'priority',
      text: `${PRIORITY_LABEL[get('priority') as OrderPriority]} priority`,
    },
    deadline && { key: 'deadline', text: DEADLINE_LABEL[deadline] ?? deadline },
    get('labelId') && { key: 'labelId', text: named(labelList, get('labelId')) },
    get('productId') && { key: 'productId', text: named(products, get('productId')) },
    get('customerId') && { key: 'customerId', text: named(customers, get('customerId')) },
    get('board') && {
      key: 'board',
      text: get('board') === 'hidden' ? 'Off the board' : 'Everything',
    },
    view === 'list' &&
      get('status') && {
        key: 'status',
        text: STATUS_LABEL[get('status') as OrderStatus],
      },
  ].filter((c): c is { key: string; text: string } => Boolean(c));

  return (
    <>
      <PageHeader
        title="Orders & Printing"
        actions={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setAdding('todo')}>
            New order
          </Button>
        }
      />

      {data && (
        <p className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[15px] text-ink-muted">
          <Stat value={data.counts.todo} label="to do" />
          <Stat value={data.counts.inProgress} label="printing" />
          {data.counts.overdue > 0 ? (
            <button
              type="button"
              onClick={() => update({ deadline: 'overdue', view: 'list' })}
              className="font-semibold text-hot-ink hover:underline"
            >
              <span className="figure">{data.counts.overdue}</span> overdue
            </button>
          ) : (
            <Stat value={0} label="overdue" />
          )}
          <span className="inline-flex items-center gap-1">
            <Stat value={data.counts.completed} label="completed" />
            <span className="relative inline-flex items-center">
              <select
                aria-label="Completed in"
                value={period}
                onChange={(e) => setPeriod(e.target.value as PeriodKey)}
                className="cursor-pointer appearance-none border-0 bg-transparent pr-5 font-semibold text-ink outline-none"
              >
                {COMPLETED_PERIODS.map((p) => (
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
          </span>
        </p>
      )}

      <Panel className="gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-11 w-full min-w-0 items-center gap-2 rounded-full border-[1.5px] border-rule px-4 focus-within:border-teal sm:w-auto sm:max-w-72 sm:flex-1">
            <Search size={17} aria-hidden="true" className="shrink-0 text-steel" />
            <span className="sr-only">Search orders</span>
            <input
              type="search"
              value={get('q')}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Search"
              className="h-full min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          {visiblePrinters.length > 0 && (
            <div
              role="group"
              aria-label="Printer queue"
              className="order-last -mx-1 w-full overflow-x-auto px-1 lg:order-none lg:w-auto lg:flex-1"
            >
              <div className="flex w-max gap-1.5">
                {[
                  { id: '', name: 'All printers' },
                  ...visiblePrinters.map((p) => ({ id: p.id, name: p.name })),
                  { id: 'none', name: 'Unassigned' },
                ].map((p) => (
                  <button
                    key={p.id || 'all'}
                    type="button"
                    aria-pressed={get('printerId') === p.id}
                    onClick={() => update({ printerId: p.id })}
                    className={cn(
                      'h-9 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap',
                      get('printerId') === p.id ? 'bg-ink text-white' : 'bg-bench hover:bg-mist',
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-expanded={showFilters}
              onClick={() => setShowFilters((v) => !v)}
              className={cn(
                'inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold',
                showFilters || chips.length
                  ? 'bg-teal-soft text-teal-ink'
                  : 'bg-bench hover:bg-mist',
              )}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              Filters
              {chips.length > 0 && <span className="figure">· {chips.length}</span>}
            </button>
            <div
              role="group"
              aria-label="View"
              className="flex h-11 gap-1 rounded-full bg-bench p-1"
            >
              {(
                [
                  ['board', 'Board', Columns3],
                  ['list', 'List', List],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  aria-label={label}
                  title={label}
                  onClick={() => update({ view: value === 'board' ? '' : value })}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 text-sm font-bold',
                    view === value ? 'bg-surface shadow-sm' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-tile)] bg-bench p-2.5">
            <FilterPill label="Type" value={get('type')} onChange={(v) => update({ type: v })}>
              {ORDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </FilterPill>
            <FilterPill
              label="Priority"
              value={get('priority')}
              onChange={(v) => update({ priority: v })}
            >
              {ORDER_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </FilterPill>
            <FilterPill label="Deadline" value={deadline} onChange={(v) => update({ deadline: v })}>
              {Object.entries(DEADLINE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </FilterPill>
            {labelList.length > 0 && (
              <FilterPill
                label="Label"
                value={get('labelId')}
                onChange={(v) => update({ labelId: v })}
              >
                {labelList
                  .filter((l: LabelView) => !l.archived)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </FilterPill>
            )}
            {products.length > 0 && (
              <FilterPill
                label="Product"
                value={get('productId')}
                onChange={(v) => update({ productId: v })}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </FilterPill>
            )}
            {customers.length > 0 && (
              <FilterPill
                label="Customer"
                value={get('customerId')}
                onChange={(v) => update({ customerId: v })}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </FilterPill>
            )}
            <FilterPill
              label="Board"
              value={get('board')}
              onChange={(v) => update({ board: v })}
              empty="Active"
            >
              <option value="hidden">
                {data ? `Off the board (done ${data.retentionDays}+ days)` : 'Off the board'}
              </option>
              <option value="all">Everything</option>
            </FilterPill>
            {view === 'list' && (
              <FilterPill
                label="Status"
                value={get('status')}
                onChange={(v) => update({ status: v })}
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </FilterPill>
            )}
          </div>
        )}

        {!showFilters && chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => update({ [chip.key]: '' })}
                aria-label={`Remove filter ${chip.text}`}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-teal-soft pr-2 pl-3 text-[13px] font-semibold text-teal-ink hover:bg-[#d3eaee]"
              >
                {chip.text}
                <X size={14} aria-hidden="true" />
              </button>
            ))}
            <button
              type="button"
              onClick={clearAll}
              className="h-8 rounded-full px-2 text-[13px] font-semibold text-ink-muted hover:text-ink"
            >
              Clear all
            </button>
          </div>
        )}

        {!data ? (
          <PageLoader label="Loading orders" />
        ) : data.orders.length === 0 && !filtered ? (
          <EmptyState
            title="The bed is clear"
            action={
              <button
                type="button"
                onClick={() => setAdding('todo')}
                className="font-semibold text-teal"
              >
                Add the first order
              </button>
            }
          >
            Orders for customers, gifts and personal fixes all land here.
          </EmptyState>
        ) : view === 'board' ? (
          <OrderBoard
            cards={data.orders}
            labels={labels}
            today={today}
            onOpen={open}
            onMove={onMove}
            onAdd={setAdding}
            onConfirmPrint={setConfirming}
          />
        ) : data.orders.length === 0 ? (
          <EmptyState title="Nothing found">Try another search or filter.</EmptyState>
        ) : (
          <OrderList cards={data.orders} today={today} onOpen={open} />
        )}
      </Panel>

      {get('card') && (
        <OrderModal
          id={get('card')}
          labels={labels}
          today={today}
          onClose={() => update({ card: '' })}
        />
      )}
      {adding && <NewOrderDialog status={adding} onClose={() => setAdding(null)} />}
      {confirming && (
        <ConsumeDialog
          confirmPrint
          order={{ id: confirming.id, title: confirming.title }}
          prefill={confirming.filaments.map((f) => ({
            itemId: f.itemId,
            quantity: toField(f.grams),
          }))}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}

const DEADLINE_LABEL: Record<string, string> = {
  overdue: 'Overdue',
  with: 'Has a deadline',
  without: 'No deadline',
};

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <span className="figure font-medium text-ink">{value}</span> {label}
    </span>
  );
}
