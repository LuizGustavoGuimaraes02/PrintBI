import { whatsappProductLink, type PublicImageView } from '@printbi/shared';
import { ArrowLeft, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router';
import { cn } from '../../design-system';
import { ApiError } from '../../lib/api';
import { filamentLine, priceLine, sizeLine } from './format';
import { PublicLayout, PublicLoading, PublicNotFound, usePageMeta } from './PublicLayout';
import { NoPhoto } from './PublicShowcasePage';
import { usePublicProduct } from './queries';
import { useShowcaseLanguage } from './language';
import { stringsFor, type ShowcaseStrings } from './strings';

export function PublicProductPage() {
  const { companySlug = '', productSlug = '' } = useParams();
  const { data: product, error, isPending } = usePublicProduct(companySlug, productSlug);
  const [language, setLanguage] = useShowcaseLanguage(product?.business.language);
  const t = stringsFor(language);
  usePageMeta(product ? `${product.name} · ${product.business.name}` : null, t.locale);

  if (isPending) return <PublicLoading />;
  if (error || !product) {
    const missing = error instanceof ApiError && error.status === 404;
    return <PublicNotFound message={missing ? undefined : error?.message} />;
  }

  const { business } = product;
  const price = priceLine(product, t);
  const specs: { label: string; value: string | null }[] = [
    { label: t.size, value: sizeLine(product, t) },
    { label: t.filament, value: filamentLine(product, t) },
    {
      label: t.soldPer,
      value: product.saleUnit === 'custom' ? product.customUnit : t.units[product.saleUnit],
    },
  ];
  const rows = specs.filter((row): row is { label: string; value: string } => Boolean(row.value));
  const whatsapp = whatsappProductLink(
    business.whatsapp,
    business.messageTemplate,
    language,
    product.name,
  );

  return (
    <PublicLayout business={business} t={t} language={language} onLanguage={setLanguage}>
      <Link
        to={`/s/${business.slug}`}
        className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden="true" /> {t.back}
      </Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
        <Gallery images={product.images} name={product.name} t={t} />
        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              <span
                className={cn(
                  'label-mono rounded-full px-2.5 py-1',
                  product.badge === 'ready' ? 'bg-teal text-white' : 'border border-rule text-ink',
                )}
              >
                {product.badge === 'ready' ? t.ready : t.madeToOrder}
              </span>
              {product.type === 'service' && (
                <span className="label-mono rounded-full border border-rule px-2.5 py-1 text-ink-muted">
                  {t.service}
                </span>
              )}
              {product.labels.map((l) => (
                <span
                  key={l.name}
                  className="label-mono rounded-full px-2.5 py-1 text-ink"
                  style={{ background: l.color }}
                >
                  {l.name}
                </span>
              ))}
            </div>
            <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.03em] md:text-[38px]">
              {product.name}
            </h1>
            <p
              className={cn(
                'figure text-lg font-semibold',
                price ? 'text-teal-ink' : 'text-ink-muted',
              )}
            >
              {price ?? t.askPrice}
            </p>
          </div>

          {product.description && (
            <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink">
              {product.description}
            </p>
          )}

          {rows.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 rounded-[var(--radius-tile)] bg-surface px-5 py-2">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="col-span-2 grid grid-cols-subgrid border-b border-rule-soft py-3 last:border-b-0"
                >
                  <dt className="label-mono self-center text-ink-muted">{row.label}</dt>
                  <dd className="figure text-right">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {whatsapp && (
            <div className="flex flex-col gap-2">
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-14 items-center justify-center gap-2.5 rounded-full bg-teal px-7 text-base font-bold text-white transition-colors hover:bg-teal-strong sm:self-start"
              >
                <MessageCircle size={20} aria-hidden="true" />
                {t.whatsapp}
              </a>
              <span className="text-xs text-ink-muted">{t.whatsappHint}</span>
            </div>
          )}
        </section>
      </div>
    </PublicLayout>
  );
}

function Gallery({
  images,
  name,
  t,
}: {
  images: PublicImageView[];
  name: string;
  t: ShowcaseStrings;
}) {
  const [index, setIndex] = useState(0);
  const current = images[index];
  if (!current) return <NoPhoto className="rounded-[var(--radius-card)]" />;

  const go = (next: number) => setIndex((next + images.length) % images.length);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(index + 1);
    if (e.key === 'ArrowLeft') go(index - 1);
  };

  return (
    <div className="flex flex-col gap-3" onKeyDown={onKeyDown}>
      <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-surface">
        <img
          key={current.urls.full}
          src={current.urls.full}
          alt={current.alt || t.photoOf(name, index + 1, images.length)}
          width={current.width}
          height={current.height}
          className="aspect-square w-full object-contain motion-safe:animate-fade-in"
        />
        {images.length > 1 && (
          <>
            <GalleryArrow side="left" label={t.previous} onClick={() => go(index - 1)} />
            <GalleryArrow side="right" label={t.next} onClick={() => go(index + 1)} />
            <span className="figure absolute right-3 bottom-3 rounded-full bg-ink/80 px-2.5 py-1 text-xs text-white">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, i) => (
            <li key={image.urls.thumb} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={t.showPhoto(i + 1)}
                aria-current={i === index}
                className={cn(
                  'block overflow-hidden rounded-[12px] border-2',
                  i === index ? 'border-teal' : 'border-transparent opacity-80 hover:opacity-100',
                )}
              >
                <img
                  src={image.urls.thumb}
                  alt=""
                  width={72}
                  height={72}
                  className="size-16 object-cover sm:size-[72px]"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GalleryArrow({
  side,
  label,
  onClick,
}: {
  side: 'left' | 'right';
  label: string;
  onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface/95 text-ink shadow-[var(--shadow-card)] hover:bg-surface',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon size={22} aria-hidden="true" />
    </button>
  );
}
