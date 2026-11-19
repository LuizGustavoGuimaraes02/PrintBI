import type { ProductView } from '@printbi/shared';
import { Package, Plus, SlidersHorizontal, Tags } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  Badge,
  Button,
  cn,
  EmptyState,
  PageHeader,
  PageLoader,
  SelectField,
  TextField,
} from '../../design-system';
import { showMoney } from '../../lib/money';
import { useCan } from '../auth/account';
import { priceText, specsText } from './forms';
import { LabelChip } from './LabelPicker';
import { ManageLabelsDialog } from './ManageLabelsDialog';
import { useLabels, useProducts, type ProductFilters } from './queries';

const TYPES: { value: ProductFilters['type']; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'product', label: 'Products' },
  { value: 'service', label: 'Services' },
];

const NO_FILTERS: ProductFilters = { q: '', type: '', labelId: '', archived: false };

function ProductRow({ product, canSeeCost }: { product: ProductView; canSeeCost: boolean }) {
  const details = product.type === 'product' ? specsText(product.specs) : '';
  return (
    <li>
      <Link
        to={`/products/${product.id}`}
        className="grid gap-x-5 gap-y-2 rounded-[var(--radius-tile)] px-3 py-4 hover:bg-bench sm:grid-cols-[56px_1fr_auto] sm:items-center"
      >
        {/* Photo thumbnail arrives with uploads; until then a layered placeholder. */}
        <span
          aria-hidden="true"
          className="hidden size-14 place-items-center rounded-2xl bg-bench text-steel sm:grid"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent 0 5px, rgb(93 116 128 / 0.12) 5px 6px)',
          }}
        >
          <Package size={22} strokeWidth={1.5} />
        </span>
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="text-[16px]">{product.name}</strong>
            {product.type === 'service' && <Badge tone="teal">Service</Badge>}
            {product.archived && <Badge>Archived</Badge>}
          </span>
          {(product.description || details) && (
            <span className="truncate text-[13px] text-ink-muted">
              {details && <span className="figure">{details}</span>}
              {details && product.description && ' · '}
              {product.description}
            </span>
          )}
          {product.labels.length > 0 && (
            <span className="flex flex-wrap gap-1.5">
              {product.labels.map((l) => (
                <LabelChip key={l.id} label={l} className="h-6 px-2.5 text-[12px]" />
              ))}
            </span>
          )}
        </span>
        <span className="flex flex-col gap-0.5 sm:items-end">
          <span
            className={cn('figure text-[18px] font-medium', !product.price && 'text-ink-muted')}
          >
            {priceText(product)}
          </span>
          {canSeeCost && product.estimatedCost && (
            <span className="figure text-[12px] text-ink-muted">
              Cost {showMoney(product.estimatedCost)}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

export function ProductsPage() {
  const [filters, setFilters] = useState<ProductFilters>(NO_FILTERS);
  const [managing, setManaging] = useState(false);
  const { data: products, isPending, isFetching } = useProducts(filters);
  // A cached empty list may be stale (e.g. right after adding one): wait for the refetch.
  const refetchingEmpty = isFetching && products?.length === 0;
  const { data: labels } = useLabels();
  const canSeeCost = useCan('finance:view');
  const set = (patch: Partial<ProductFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const filtered = Boolean(filters.q || filters.type || filters.labelId || filters.archived);
  const activeLabels = labels?.filter((l) => !l.archived) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Products & Services"
        description="What you sell, with the usual price, size and filament of each piece."
        actions={
          <>
            <Button
              variant="soft"
              icon={<Tags size={18} aria-hidden="true" />}
              onClick={() => setManaging(true)}
            >
              Labels
            </Button>
            <Link
              to="/products/new"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-teal px-6 text-[15px] font-bold text-white hover:bg-teal-strong"
            >
              <Plus size={18} aria-hidden="true" /> Add product
            </Link>
          </>
        }
      />

      <section
        aria-label="Catalog"
        className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-surface p-5 md:p-6"
      >
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label="Search"
            placeholder="Name or description"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            className="min-w-56 flex-1"
          />
          <SelectField
            label="Label"
            value={filters.labelId}
            onChange={(e) => set({ labelId: e.target.value })}
            className="w-48"
          >
            <option value="">Any label</option>
            {activeLabels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
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
        <div role="group" aria-label="Type" className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={filters.type === t.value}
              onClick={() => set({ type: t.value })}
              className={cn(
                'h-10 rounded-full px-4 text-sm font-semibold whitespace-nowrap',
                filters.type === t.value
                  ? 'bg-ink text-white'
                  : 'bg-bench text-ink hover:bg-rule-soft',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {(isPending || refetchingEmpty) && <PageLoader label="Loading catalog" />}
        {products && products.length === 0 && !refetchingEmpty && (
          <EmptyState
            title={filtered ? 'Nothing matches these filters' : 'Nothing in the catalog yet'}
            action={
              filtered ? (
                <Button
                  variant="soft"
                  icon={<SlidersHorizontal size={16} aria-hidden="true" />}
                  onClick={() => setFilters(NO_FILTERS)}
                >
                  Clear filters
                </Button>
              ) : (
                <Link
                  to="/products/new"
                  className="inline-flex h-12 items-center rounded-full bg-teal px-6 font-bold text-white"
                >
                  Add your first product
                </Link>
              )
            }
          >
            {filtered
              ? 'Try another search or filter.'
              : 'Keychains, vases, replacement parts, or services such as 3D modelling.'}
          </EmptyState>
        )}
        {products && products.length > 0 && (
          <ul className="flex flex-col divide-y divide-rule-soft">
            {products.map((p) => (
              <ProductRow key={p.id} product={p} canSeeCost={canSeeCost} />
            ))}
          </ul>
        )}
      </section>
      {managing && <ManageLabelsDialog onClose={() => setManaging(false)} />}
    </>
  );
}
