import type { PublicBusinessView, PublicImageView, ShowcaseLanguage } from '@printbi/shared';
import { ExternalLink } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { EmptyState, NozzleLoader, SpoolMark } from '../../design-system';
import { safeUrl } from './format';
import { LanguageSwitch } from './language';
import { browserLanguage, stringsFor, type ShowcaseStrings } from './strings';

/** Sets the tab title and the page language for screen readers and translators. */
export function usePageMeta(title: string | null, language: string) {
  useEffect(() => {
    const previous = { title: document.title, lang: document.documentElement.lang };
    if (title) document.title = title;
    document.documentElement.lang = language;
    return () => {
      document.title = previous.title;
      document.documentElement.lang = previous.lang;
    };
  }, [title, language]);
}

export function BusinessMark({
  business,
  size = 48,
}: {
  business: PublicBusinessView;
  size?: number;
}) {
  if (business.logo) return <Logo logo={business.logo} name={business.name} size={size} />;
  const initials = business.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      aria-hidden="true"
      className="figure flex shrink-0 items-center justify-center rounded-[14px] bg-ink font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials}
    </span>
  );
}

function Logo({ logo, name, size }: { logo: PublicImageView; name: string; size: number }) {
  return (
    <img
      src={logo.urls.full}
      alt={`${name} logo`}
      className="shrink-0 rounded-[14px] object-contain"
      style={{ width: size, height: size }}
    />
  );
}

interface PublicLayoutProps {
  business: PublicBusinessView;
  t: ShowcaseStrings;
  language: ShowcaseLanguage;
  onLanguage: (language: ShowcaseLanguage) => void;
  children: ReactNode;
}

export function PublicLayout({ business, t, language, onLanguage, children }: PublicLayoutProps) {
  const website = safeUrl(business.website);
  const social = safeUrl(business.social);
  return (
    <div className="flex min-h-dvh flex-col bg-mist">
      <header className="border-b border-rule-soft bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to={`/s/${business.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
            <BusinessMark business={business} size={40} />
            <span className="truncate text-lg font-extrabold tracking-[-0.02em]">
              {business.name}
            </span>
          </Link>
          <LanguageSwitch language={language} onChange={onLanguage} />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <footer className="border-t border-rule-soft bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-ink-muted sm:px-6">
          <div className="flex flex-wrap gap-4">
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold hover:text-ink"
              >
                {t.website} <ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
            {social && (
              <a
                href={social}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold hover:text-ink"
              >
                {t.social} <ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
          </div>
          <span className="inline-flex items-center gap-2 text-xs">
            <SpoolMark size={18} /> {t.poweredBy}
          </span>
        </div>
      </footer>
    </div>
  );
}

export function PublicLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-mist">
      <NozzleLoader label="Loading" />
    </div>
  );
}

export function PublicNotFound({ message }: { message?: string }) {
  const t = stringsFor(browserLanguage());
  usePageMeta(t.notFoundTitle, t.locale);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-mist px-4">
      <div className="w-full max-w-lg">
        <EmptyState title={t.notFoundTitle}>{message ?? t.notFoundHint}</EmptyState>
      </div>
    </div>
  );
}
