import { localized, type PublicCollectionView, type ShowcaseLanguage } from '@printbi/shared';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { cn } from '../../design-system';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { stringsFor } from './strings';
import { THEMES } from './themes';

const AUTO_ADVANCE_MS = 6000;

/** The uploaded banner in the visitor's language, else the Portuguese one. */
function bannerFor(collection: PublicCollectionView, language: ShowcaseLanguage) {
  const own = language === 'en' ? collection.banners.en : collection.banners.pt;
  return own.desktop || own.mobile ? own : collection.banners.pt;
}

/**
 * Active seasonal collections at the top of the main showcase. Several become a carousel with
 * arrows, dots and keyboard support; it moves on its own only when the visitor allows motion,
 * and pauses while hovered or focused.
 */
export function CollectionBanner({
  collections,
  businessSlug,
  language,
}: {
  collections: PublicCollectionView[];
  businessSlug: string;
  language: ShowcaseLanguage;
}) {
  const t = stringsFor(language);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const count = collections.length;
  const current = collections[Math.min(index, count - 1)];

  useEffect(() => {
    if (count < 2 || paused || reduceMotion) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [count, paused, reduceMotion]);

  if (!current) return null;
  const go = (next: number) => setIndex((next + count) % count);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(index + 1);
    if (e.key === 'ArrowLeft') go(index - 1);
  };
  const name = localized(current.name, language);

  return (
    <section
      aria-roledescription={count > 1 ? 'carousel' : undefined}
      aria-label={t.collections}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKeyDown}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        // A clear sideways swipe changes the slide; a tap still follows the link.
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (count < 2 || start === null || end === undefined || Math.abs(end - start) < 50) return;
        go(end < start ? index + 1 : index - 1);
      }}
      className="flex flex-col gap-3"
    >
      <div className="relative overflow-hidden rounded-[var(--radius-card)]">
        <Slide
          key={current.key}
          collection={current}
          href={`/s/${businessSlug}/c/${current.slug}`}
          language={language}
          label={count > 1 ? t.slideOf(name, index + 1, count) : name}
        />
        {count > 1 && (
          <>
            <Arrow side="left" label={t.prevCollection} onClick={() => go(index - 1)} />
            <Arrow side="right" label={t.nextCollection} onClick={() => go(index + 1)} />
          </>
        )}
      </div>
      {count > 1 && (
        <div className="flex justify-center gap-2.5">
          {collections.map((c, i) => (
            <button
              key={c.key}
              type="button"
              aria-label={t.showCollection(localized(c.name, language))}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={cn(
                'h-3 rounded-full border-2 border-ink transition-all',
                i === index ? 'w-8 bg-ink' : 'w-3 bg-transparent',
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Slide({
  collection,
  href,
  language,
  label,
}: {
  collection: PublicCollectionView;
  href: string;
  language: ShowcaseLanguage;
  label: string;
}) {
  const t = stringsFor(language);
  const theme = THEMES[collection.key];
  const banner = bannerFor(collection, language);
  const phone = useMediaQuery('(max-width: 639px)');
  useEffect(() => {
    void theme.loadFont();
  }, [theme]);

  // An uploaded banner carries its own text, so the image alone is the link.
  const image = banner.desktop ?? banner.mobile;
  if (image) {
    return (
      <Link to={href} aria-label={label} className="block motion-safe:animate-fade-in">
        <picture>
          {banner.mobile && <source media="(max-width: 639px)" srcSet={banner.mobile.urls.full} />}
          <img
            src={image.urls.full}
            alt={banner.alt || label}
            className="aspect-[4/5] w-full object-cover sm:aspect-[3/1]"
          />
        </picture>
      </Link>
    );
  }

  return (
    <Link
      to={href}
      aria-label={label}
      style={theme.vars as CSSProperties}
      className="relative block aspect-[4/5] overflow-hidden bg-[var(--t-hero)] text-[var(--t-hero-ink)] motion-safe:animate-fade-in sm:aspect-[3/1]"
    >
      <svg
        aria-hidden="true"
        viewBox={phone ? '560 0 720 560' : '0 0 1280 560'}
        preserveAspectRatio={phone ? 'xMidYMax slice' : 'xMaxYMid slice'}
        className="absolute inset-0 size-full"
      >
        <theme.Illustration />
      </svg>
      <span className="pointer-events-none absolute inset-0 overflow-hidden">
        <theme.Effects />
      </span>
      <span className="relative flex max-w-md flex-col gap-3 p-6 sm:p-10 md:p-14">
        <span className="label-mono text-[var(--t-eyebrow)]">{t.seasonal}</span>
        <span
          style={theme.heading}
          className="text-[34px] leading-none sm:text-[44px] md:text-[56px]"
        >
          {localized(collection.title, language)}
        </span>
        <span className="mt-2 inline-flex h-11 items-center gap-2 self-start rounded-full bg-[var(--t-hero-cta)] px-5 text-sm font-bold text-[var(--t-on-hero-cta)]">
          {t.seeCollection} <ArrowRight size={16} aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}

function Arrow({
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
      aria-label={label}
      onClick={onClick}
      className={cn(
        // On phones the dots do the job; the arrows would sit on the text.
        'absolute top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-[var(--shadow-card)] hover:bg-mist sm:flex',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon size={22} aria-hidden="true" />
    </button>
  );
}
