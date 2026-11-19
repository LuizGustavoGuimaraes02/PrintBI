import { formatMoney, type InventoryItemView, type Money } from '@printbi/shared';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  Badge,
  Button,
  cn,
  EmptyState,
  FilamentBar,
  PageHeader,
  PageLoader,
  SelectField,
  SpoolGauge,
  TextField,
} from '../../design-system';
import { ColorSwatch, filamentFinish, filamentStops } from '../../design-system/ColorSwatch';
import { showGrams, showQuantity } from '../../lib/quantity';
import { useCan } from '../auth/account';
import { ConsumeDialog } from './ConsumeDialog';
import { useInventoryItems, useInventorySummary, type ItemFilters } from './queries';
import { UnrecordedExpensesNotice } from './UnrecordedExpenses';

const KINDS: { value: ItemFilters['kind']; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'filament', label: 'Filament' },
  { value: 'material', label: 'Materials' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'other', label: 'Other' },
];

const moneyList = (values: Money[] | null) =>
  values && values.length > 0 ? values.map((v) => formatMoney(v)).join(' + ') : '—';

function Summary() {
  const { data } = useInventorySummary();
  const canSeeFinance = useCan('finance:view');
  const cells = [
    { label: 'Filaments', value: data ? String(data.filamentItems) : '—' },
    { label: 'Filament on hand', value: data ? showGrams(data.filamentGrams) : '—' },
    {
      label: 'Low stock',
      value: data ? String(data.lowStockItems) : '—',
      attention: (data?.lowStockItems ?? 0) > 0,
    },
    ...(canSeeFinance
      ? [{ label: 'Stock value', value: moneyList(data?.value ?? null), attention: false }]
      : []),
  ];
  return (
    <section
      aria-label="Inventory summary"
      className={cn(
        'grid rounded-[var(--radius-card)] bg-surface px-6 py-5 sm:grid-cols-2',
        canSeeFinance ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
      )}
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={cn(
            'flex flex-col gap-1 py-2 sm:px-5',
            i > 0 && 'lg:border-l lg:border-rule-soft',
            i === 0 && 'sm:pl-0',
          )}
        >
          <span className="label-mono text-ink-muted">{cell.label}</span>
          <span
            className={cn(
              'figure text-[28px] leading-tight font-medium',
              cell.attention && 'text-hot-ink',
            )}
          >
            {cell.value}
          </span>
        </div>
      ))}
    </section>
  );
}

function ItemRow({ item, canSeeFinance }: { item: InventoryItemView; canSeeFinance: boolean }) {
  const filament = item.kind === 'filament' ? item.filament : null;
  const activeLots = item.lots.filter((l) => l.status !== 'archived');
  const capacity = activeLots.reduce((sum, l) => sum + l.originalQuantity, 0);
  return (
    <li>
      <Link
        to={`/inventory/${item.id}`}
        className="grid gap-x-5 gap-y-2 rounded-[var(--radius-tile)] px-3 py-4 hover:bg-bench sm:grid-cols-[56px_1fr_auto] sm:items-center"
      >
        <span className="hidden sm:block">
          {filament ? (
            <SpoolGauge
              remaining={item.remaining}
              capacity={capacity}
              color={filamentStops(filament)}
              size={52}
              spinning={false}
            />
          ) : (
            <span className="figure grid size-12 place-items-center rounded-2xl bg-bench text-[11px] text-ink-muted uppercase">
              {item.unit === 'custom' ? item.customUnit.slice(0, 4) : item.unit}
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            {filament && (
              <ColorSwatch
                stops={filamentStops(filament)}
                finish={filamentFinish(filament)}
                size={16}
                className="sm:hidden"
              />
            )}
            <strong className="text-[16px]">{item.name}</strong>
            {item.out && <Badge tone="hot">Out of stock</Badge>}
            {item.low && (
              <Badge tone="hot">
                {item.kind === 'filament'
                  ? `${item.lowLots} ${item.lowLots === 1 ? 'roll' : 'rolls'} low`
                  : 'Low'}
              </Badge>
            )}
            {item.archived && <Badge>Archived</Badge>}
          </span>
          <span className="figure truncate text-[13px] text-ink-muted">
            {filament
              ? [
                  filament.brand,
                  filament.materialType,
                  filament.colorName,
                  `${filament.diameterMm} mm`,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : [item.category, item.description].filter(Boolean).join(' · ')}
          </span>
          {!filament && capacity > 0 && (
            <div className="max-w-sm">
              <FilamentBar
                value={item.remaining}
                max={capacity}
                label="Left"
                readout={showQuantity(item.remaining, item)}
                attention={item.low || item.out}
              />
            </div>
          )}
        </span>
        <span className="flex flex-col gap-0.5 sm:items-end">
          <span
            className={cn(
              'figure text-[18px] font-medium',
              (item.low || item.out) && 'text-hot-ink',
            )}
          >
            {showQuantity(item.remaining, item)}
          </span>
          <span className="figure text-[12px] text-ink-muted">
            {item.activeLots}{' '}
            {filament
              ? item.activeLots === 1
                ? 'roll'
                : 'rolls'
              : item.activeLots === 1
                ? 'lot'
                : 'lots'}
            {canSeeFinance && item.value && item.value.length > 0 && ` · ${moneyList(item.value)}`}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function InventoryPage() {
  const [filters, setFilters] = useState<ItemFilters>({
    kind: '',
    stock: '',
    archived: false,
    q: '',
  });
  const [consuming, setConsuming] = useState(false);
  const { data: items, isPending } = useInventoryItems(filters);
  const canSeeFinance = useCan('finance:view');
  const set = (patch: Partial<ItemFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const filtered = Boolean(filters.kind || filters.stock || filters.archived || filters.q);

  return (
    <>
      <PageHeader
        eyebrow="Workshop"
        title="Inventory"
        description="Every roll and consumable, what is left and what it cost."
        actions={
          <>
            <Button variant="soft" onClick={() => setConsuming(true)}>
              Record usage
            </Button>
            <Link
              to="/inventory/new"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-teal px-6 text-[15px] font-bold text-white hover:bg-teal-strong"
            >
              <Plus size={18} aria-hidden="true" /> Add item
            </Link>
          </>
        }
      />
      <UnrecordedExpensesNotice />
      <Summary />

      <section
        aria-label="Items"
        className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-surface p-5 md:p-6"
      >
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label="Search"
            placeholder="Name, brand, color, material"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            className="min-w-56 flex-1"
          />
          <SelectField
            label="Stock"
            value={filters.stock}
            onChange={(e) => set({ stock: e.target.value as ItemFilters['stock'] })}
            className="w-40"
          >
            <option value="">Any</option>
            <option value="low">Low</option>
            <option value="out">Out</option>
          </SelectField>
          <SelectField
            label="Status"
            value={filters.archived ? 'archived' : 'active'}
            onChange={(e) => set({ archived: e.target.value === 'archived' })}
            className="w-40"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </SelectField>
        </div>
        <div className="-mx-1 overflow-x-auto px-1">
          <div role="group" aria-label="Type of item" className="flex w-max gap-2">
            {KINDS.map((k) => (
              <button
                key={k.label}
                type="button"
                aria-pressed={filters.kind === k.value}
                onClick={() => set({ kind: k.value })}
                className={cn(
                  'h-10 rounded-full px-4 text-sm font-semibold whitespace-nowrap',
                  filters.kind === k.value
                    ? 'bg-ink text-white'
                    : 'bg-bench text-ink hover:bg-rule-soft',
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {isPending && <PageLoader label="Loading stock" />}
        {items && items.length === 0 && (
          <EmptyState
            title={filtered ? 'Nothing matches these filters' : 'The shelf is empty'}
            action={
              filtered ? (
                <Button
                  variant="soft"
                  icon={<SlidersHorizontal size={16} aria-hidden="true" />}
                  onClick={() => setFilters({ kind: '', stock: '', archived: false, q: '' })}
                >
                  Clear filters
                </Button>
              ) : (
                <Link
                  to="/inventory/new"
                  className="inline-flex h-12 items-center rounded-full bg-teal px-6 font-bold text-white"
                >
                  Add your first roll
                </Link>
              )
            }
          >
            {filtered
              ? 'Try another search or filter.'
              : 'Add filament rolls, screws, magnets, boxes and anything else your prints use.'}
          </EmptyState>
        )}
        {items && items.length > 0 && (
          <ul className="flex flex-col divide-y divide-rule-soft">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} canSeeFinance={canSeeFinance} />
            ))}
          </ul>
        )}
      </section>
      {consuming && <ConsumeDialog onClose={() => setConsuming(false)} />}
    </>
  );
}
