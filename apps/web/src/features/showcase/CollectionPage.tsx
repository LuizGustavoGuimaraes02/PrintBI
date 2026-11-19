import {
  localized,
  whatsappProductLink,
  type PublicCollectionPageView,
  type PublicProductCardView,
  type ShowcaseLanguage,
} from '@printbi/shared';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { useEffect, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import { cn } from '../../design-system';
import { ApiError } from '../../lib/api';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { priceLine } from './format';
import { useShowcaseLanguage, LanguageSwitch } from './language';
import { BusinessMark, PublicLoading, PublicNotFound, usePageMeta } from './PublicLayout';
import { NoPhoto } from './PublicShowcasePage';
import { usePublicCollection } from './queries';
import { stringsFor, type ShowcaseStrings } from './strings';
import { THEMES, type Theme } from './themes';

/** /s/:companySlug/c/:collectionSlug — a seasonal page; answers "not found" while turned off. */
export function PublicCollectionPage() {
  const { companySlug = '', collectionSlug = '' } = useParams();
  const { data, error, isPending } = usePublicCollection(companySlug, collectionSlug);
  if (isPending) return <PublicLoading />;
  if (error || !data) {
    const missing = error instanceof ApiError && error.status === 404;
    return <PublicNotFound message={missing ? undefined : error?.message} />;
  }
  return <CollectionPageView data={data} />;
}

const WA_PATH = 'M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20l1.3-5.1A8.4 8.4 0 1 1 21 11.5z';

/** The themed page itself: shared by the public route and the admin's preview. */
export function CollectionPageView({ data }: { data: PublicCollectionPageView }) {
  const { business, collection, products, preview } = data;
  const [language, setLanguage] = useShowcaseLanguage(business.language);
  const t = stringsFor(language);
  const theme = THEMES[collection.key];
  const phone = useMediaQuery('(max-width: 767px)');
  const name = localized(collection.name, language);
  usePageMeta(`${name} · ${business.name}`, t.locale);
  useEffect(() => {
    void theme.loadFont();
  }, [theme]);

  const digits = business.whatsapp.replace(/\D/g, '');
  const chat = digits.length >= 8 ? `https://wa.me/${digits}` : null;
  const lang = language === 'en' ? 'en' : 'pt';

  return (
    <div
      style={theme.vars as CSSProperties}
      className="flex min-h-dvh flex-col bg-[var(--t-bg)] text-[var(--t-ink)]"
    >
      {preview && (
        <p
          role="status"
          className="bg-ink px-4 py-2.5 text-center text-sm font-semibold text-white"
        >
          {t.previewNotice}
        </p>
      )}
      <header className="relative z-20 border-b border-[var(--t-line)] bg-[var(--t-header)]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to={`/s/${business.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
            <BusinessMark business={business} size={40} />
            <span className="truncate text-lg font-extrabold tracking-[-0.02em]">
              {business.name}
            </span>
          </Link>
          <Link
            to={`/s/${business.slug}`}
            className="hidden items-center gap-1.5 text-sm font-semibold text-[var(--t-muted)] hover:text-[var(--t-ink)] sm:inline-flex"
          >
            <ArrowLeft size={16} aria-hidden="true" /> {t.back}
          </Link>
          <LanguageSwitch
            language={language}
            onChange={setLanguage}
            tone={theme.dark ? 'dark' : 'light'}
          />
        </div>
      </header>

      <section className="relative overflow-hidden bg-[var(--t-hero)] md:min-h-[560px]">
        {collection.header ? (
          <>
            <img
              src={collection.header.urls.full}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
            {/* Keeps the text readable over any photo. */}
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-linear-to-r from-[var(--t-hero)] via-[var(--t-hero)]/80 to-transparent"
            />
          </>
        ) : (
          !phone && (
            <svg
              aria-hidden="true"
              viewBox="0 0 1280 560"
              preserveAspectRatio="xMaxYMid slice"
              className="absolute inset-0 size-full"
            >
              <theme.Illustration />
            </svg>
          )
        )}
        <span className="pointer-events-none absolute inset-0 overflow-hidden">
          <theme.Effects />
        </span>
        <div className="relative mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-12 pb-8 sm:px-6 md:pt-24 md:pb-24">
          <div className="flex max-w-xl flex-col gap-4">
            <span className="label-mono text-[var(--t-eyebrow)]">
              {t.collection} · {name}
            </span>
            <h1
              style={theme.heading}
              className="text-[44px] leading-[1.02] text-[var(--t-hero-ink)] md:text-[68px]"
            >
              {localized(collection.title, language)}
            </h1>
            <p className="text-lg leading-relaxed text-[var(--t-hero-muted)]">
              {localized(collection.intro, language)}
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <a
                href="#pieces"
                className="inline-flex h-12 items-center rounded-full bg-[var(--t-hero-cta)] px-6 font-bold text-[var(--t-on-hero-cta)]"
              >
                {t.seePieces}
              </a>
              {chat && <WhatsAppButton href={chat} label={t.chatWa} />}
            </div>
          </div>
        </div>
        {!collection.header && phone && (
          <svg aria-hidden="true" viewBox="560 120 720 440" className="relative block w-full">
            <theme.Illustration />
          </svg>
        )}
      </section>

      <main
        id="pieces"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 md:py-14"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 style={theme.heading} className="text-[34px] text-[var(--t-heading)] md:text-[40px]">
            {name}
          </h2>
          <span className="label-mono text-[var(--t-muted)]">{t.pieces(products.length)}</span>
        </div>
        {products.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-[var(--t-card-line)] bg-[var(--t-card)] px-6 py-10 text-center text-[var(--t-muted)]">
            {t.emptyCollection}
          </p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ThemedCard
                key={product.slug}
                product={product}
                businessSlug={business.slug}
                orderLink={whatsappProductLink(
                  business.whatsapp,
                  business.messageTemplate,
                  language,
                  product.name,
                )}
                t={t}
                language={language}
              />
            ))}
          </ul>
        )}
        <Strip theme={theme} t={t} lang={lang} chat={chat} />
      </main>

      <footer className="border-t border-[var(--t-line)] bg-[var(--t-header)]">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-4 py-5 text-[13px] text-[var(--t-muted)] sm:px-6">
          <span>
            {business.name} · {name}
          </span>
          <span>{t.poweredBy}</span>
        </div>
      </footer>
    </div>
  );
}

function WhatsAppButton({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex h-12 items-center gap-2 rounded-full border-2 border-[var(--t-wa-ring)] bg-[var(--t-wa)] px-5 font-bold text-[var(--t-on-wa)] hover:brightness-95',
        className,
      )}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={WA_PATH} />
      </svg>
      {label}
    </a>
  );
}

function ThemedCard({
  product,
  businessSlug,
  orderLink,
  t,
  language,
}: {
  product: PublicProductCardView;
  businessSlug: string;
  orderLink: string | null;
  t: ShowcaseStrings;
  language: ShowcaseLanguage;
}) {
  const price = priceLine(product, t);
  const href = `/s/${businessSlug}/${product.slug}`;
  return (
    <li className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--t-card-line)] bg-[var(--t-card)] shadow-[var(--shadow-card)]">
      <Link to={href} className="relative block bg-[var(--t-media)]">
        {product.cover ? (
          <img
            src={product.cover.urls.card}
            alt={product.cover.alt || product.name}
            width={800}
            height={800}
            loading="lazy"
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <div className="aspect-[4/3]">
            <NoPhoto className="aspect-auto! h-full bg-transparent" />
          </div>
        )}
        <span className="label-mono absolute top-3 left-3 rounded-full bg-[var(--t-badge)] px-2.5 py-1 text-[var(--t-on-badge)]">
          {product.badge === 'ready' ? t.ready : t.madeToOrder}
        </span>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-5">
        {product.labels.length > 0 && (
          <span className="label-mono truncate text-[var(--t-muted)]">
            {product.labels.map((l) => l.name).join(' · ')}
          </span>
        )}
        <Link to={href} className="text-lg leading-snug font-bold hover:underline">
          {product.name}
        </Link>
        {price && <span className="figure font-medium text-[var(--t-price)]">{price}</span>}
        {orderLink && (
          <a
            href={orderLink}
            target="_blank"
            rel="noopener noreferrer"
            lang={language}
            className="mt-auto inline-flex h-11 items-center gap-2 self-start rounded-full border-2 border-[var(--t-wa-ring)] bg-[var(--t-wa)] px-4 text-sm font-bold text-[var(--t-on-wa)] hover:brightness-95"
          >
            <MessageCircle size={17} aria-hidden="true" />
            {t.orderWa}
          </a>
        )}
      </div>
    </li>
  );
}

function Strip({
  theme,
  t,
  lang,
  chat,
}: {
  theme: Theme;
  t: ShowcaseStrings;
  lang: 'pt' | 'en';
  chat: string | null;
}) {
  return (
    <div className="mt-4 flex flex-col gap-5 rounded-[var(--radius-card)] border border-[var(--t-card-line)] bg-[var(--t-card)] p-6 sm:flex-row sm:items-center">
      <theme.StripMark />
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-lg font-bold">{theme.strip.title[lang]}</span>
        <span className="text-[var(--t-muted)]">{theme.strip.text[lang]}</span>
      </div>
      {chat && <WhatsAppButton href={chat} label={t.chatWa} />}
    </div>
  );
}
