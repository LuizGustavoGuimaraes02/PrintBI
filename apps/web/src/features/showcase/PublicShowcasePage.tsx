import type { PublicProductCardView } from '@printbi/shared';
import { Search, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { cn, EmptyState } from '../../design-system';
import { ApiError } from '../../lib/api';
import { plain, priceLine } from './format';
import {
  BusinessMark,
  PublicLayout,
  PublicLoading,
  PublicNotFound,
  usePageMeta,
} from './PublicLayout';
import { usePublicShowcase } from './queries';
import { stringsFor, type ShowcaseStrings } from './strings';

export function PublicShowcasePage() {
  const { companySlug = '' } = useParams();
  const { data, error, isPending } = usePublicShowcase(companySlug);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const deferred = useDeferredValue(query);
  const label = params.get('label') ?? '';
  const t = stringsFor(data?.business.language ?? 'pt-BR');
  usePageMeta(data ? data.business.name : null, t.locale);

  const products = useMemo(() => {
    if (!data) return [];
    const words = plain(deferred).split(/\s+/).filter(Boolean);
    return data.products.filter(
      (p) =>
        (!label || p.labels.some((l) => l.name === label)) &&
        words.every((w) => plain(`${p.name} ${p.description}`).includes(w)),
    );
  }, [data, deferred, label]);

  if (isPending) return <PublicLoading />;
  if (error || !data) {
    return error instanceof ApiError && error.status === 404 ? (
      <PublicNotFound />
    ) : (
      <PublicNotFound message={error?.message} />
    );
  }

  const { business } = data;
  const filtering = Boolean(deferred.trim() || label);
  const setLabel = (name: string) => {
    const next = new URLSearchParams(params);
    if (name) next.set('label', name);
    else next.delete('label');
    setParams(next, { replace: true });
  };

  return (
    <PublicLayout business={business} t={t}>
      <section className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-surface p-6 sm:flex-row sm:items-center sm:gap-6 md:p-8">
        <BusinessMark business={business} size={88} />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.03em] md:text-[40px]">
            {business.name}
          </h1>
          {business.title && (
            <p className="text-lg font-semibold text-teal-ink">{business.title}</p>
          )}
          {business.description && (
            <p className="max-w-2xl whitespace-pre-line text-ink-muted">{business.description}</p>
          )}
        </div>
      </section>

      {data.products.length === 0 ? (
        <EmptyState title={t.emptyTitle}>{t.emptyHint}</EmptyState>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <label className="flex h-12 items-center gap-2 rounded-full border-[1.5px] border-rule bg-surface px-4 focus-within:border-teal sm:max-w-md">
              <Search size={18} aria-hidden="true" className="text-steel" />
              <span className="sr-only">{t.search}</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="h-full min-w-0 flex-1 bg-transparent outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t.clear}
                  className="text-steel hover:text-ink"
                >
                  <X size={18} />
                </button>
              )}
            </label>
            {data.labels.length > 0 && (
              <div
                role="group"
                aria-label={t.filterBy}
                className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
              >
                <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
                  {[{ name: '', color: '' }, ...data.labels].map((l) => {
                    const active = label === l.name;
                    return (
                      <button
                        key={l.name || 'all'}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setLabel(l.name)}
                        className={cn(
                          'inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors',
                          active ? 'bg-ink text-white' : 'bg-surface text-ink hover:bg-bench',
                        )}
                      >
                        {l.color && (
                          <span
                            aria-hidden="true"
                            className="size-2.5 rounded-full border border-black/10"
                            style={{ background: l.color }}
                          />
                        )}
                        {l.name || t.all}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <p className="label-mono text-ink-muted" aria-live="polite">
            {t.results(products.length)}
          </p>

          {products.length === 0 ? (
            <EmptyState
              title={t.noResults}
              action={
                <button
                  type="button"
                  className="font-semibold text-teal"
                  onClick={() => {
                    setQuery('');
                    setLabel('');
                  }}
                >
                  {t.clear}
                </button>
              }
            >
              {t.noResultsHint}
            </EmptyState>
          ) : (
            <ul className="grid grid-flow-dense grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <ProductCard
                  key={product.slug}
                  product={product}
                  businessSlug={business.slug}
                  t={t}
                  // Featured pieces take a double tile, unless the list is being searched.
                  large={product.featured && !filtering}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </PublicLayout>
  );
}

function ProductCard({
  product,
  businessSlug,
  t,
  large,
}: {
  product: PublicProductCardView;
  businessSlug: string;
  t: ShowcaseStrings;
  large: boolean;
}) {
  const price = priceLine(product, t);
  return (
    <li className={cn(large && 'col-span-2 row-span-2')}>
      <Link
        to={`/s/${businessSlug}/${product.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal motion-safe:hover:-translate-y-0.5"
      >
        <div className="relative">
          {product.cover ? (
            <img
              src={product.cover.urls.card}
              alt={product.cover.alt || product.name}
              width={800}
              height={800}
              loading="lazy"
              className="aspect-square w-full bg-bench object-cover"
            />
          ) : (
            <NoPhoto />
          )}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            {product.featured && (
              <span className="label-mono rounded-full bg-ink px-2.5 py-1 text-white">
                {t.featured}
              </span>
            )}
            <span
              className={cn(
                'label-mono rounded-full px-2.5 py-1',
                product.badge === 'ready' ? 'bg-teal text-white' : 'bg-surface text-ink',
              )}
            >
              {product.badge === 'ready' ? t.ready : t.madeToOrder}
            </span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          {product.labels.length > 0 && (
            <span className="label-mono truncate text-ink-muted">
              {product.labels.map((l) => l.name).join(' · ')}
            </span>
          )}
          <h2
            className={cn('leading-snug font-bold', large ? 'text-xl' : 'text-[15px] sm:text-base')}
          >
            {product.name}
          </h2>
          {large && product.description && (
            <p className="line-clamp-2 text-sm text-ink-muted">{product.description}</p>
          )}
          {price && (
            <p className="figure mt-auto pt-1 text-sm font-semibold text-teal-ink">{price}</p>
          )}
        </div>
      </Link>
    </li>
  );
}

/** Placeholder for a product without photos: a fresh first layer on the bed. */
export function NoPhoto({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex aspect-square w-full items-center justify-center bg-bench', className)}
    >
      <svg viewBox="0 0 120 120" className="w-1/3" aria-hidden="true">
        <rect x="10" y="96" width="100" height="8" rx="4" fill="var(--color-rule)" />
        <rect
          x="34"
          y="84"
          width="52"
          height="8"
          rx="4"
          fill="var(--color-teal-soft)"
          stroke="var(--color-teal)"
          strokeWidth="1.5"
        />
        <rect
          x="42"
          y="72"
          width="36"
          height="8"
          rx="4"
          fill="var(--color-teal-soft)"
          stroke="var(--color-teal)"
          strokeWidth="1.5"
        />
        <rect
          x="50"
          y="60"
          width="20"
          height="8"
          rx="4"
          fill="var(--color-teal-soft)"
          stroke="var(--color-teal)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      </svg>
    </div>
  );
}
