import type { ShowcaseLanguage } from '@printbi/shared';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../design-system';
import { stringsFor } from './strings';

const STORAGE_KEY = 'pb-showcase-language';

function readStored(): ShowcaseLanguage | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'en' || value === 'pt-BR' ? value : null;
  } catch {
    return null;
  }
}

/**
 * The visitor's language on the public pages: their earlier choice, else the language the
 * business chose for its showcase. The choice is a per-browser convenience only.
 */
export function useShowcaseLanguage(fallback: ShowcaseLanguage | undefined) {
  const [chosen, setChosen] = useState<ShowcaseLanguage | null>(readStored);
  const language: ShowcaseLanguage = chosen ?? fallback ?? 'pt-BR';
  const choose = (next: ShowcaseLanguage) => {
    setChosen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private windows may refuse storage; the choice still holds for this visit.
    }
  };
  return [language, choose] as const;
}

export function BrazilFlag({ width = 24 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 17) / 24} viewBox="0 0 24 17" aria-hidden="true">
      <rect width="24" height="17" fill="#009C3B" />
      <path d="M12 2 L22 8.5 L12 15 L2 8.5Z" fill="#FFDF00" />
      <circle cx="12" cy="8.5" r="3.8" fill="#002776" />
      <path d="M8.4 7.8 Q12 6.6 15.6 8.6" stroke="#fff" strokeWidth=".8" fill="none" />
    </svg>
  );
}

export function CanadaFlag({ width = 24 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 17) / 24} viewBox="0 0 32 17" aria-hidden="true">
      <rect width="32" height="17" fill="#fff" />
      <rect width="8" height="17" fill="#D52B1E" />
      <rect x="24" width="8" height="17" fill="#D52B1E" />
      <path
        d="M16 2.6 L17 4.6 L18.3 4 L17.9 7 L19.6 5.3 L20 6.3 L21.6 6 L21 7.8 L21.8 8.2 L18.8 10.6 L19.1 11.6 L16.3 11.1 L16.4 13.8 H15.6 L15.7 11.1 L12.9 11.6 L13.2 10.6 L10.2 8.2 L11 7.8 L10.4 6 L12 6.3 L12.4 5.3 L14.1 7 L13.7 4 L15 4.6Z"
        fill="#D52B1E"
      />
    </svg>
  );
}

const OPTIONS: { value: ShowcaseLanguage; label: string; code: string; Flag: typeof BrazilFlag }[] =
  [
    { value: 'pt-BR', label: 'Português (Brasil)', code: 'PT', Flag: BrazilFlag },
    // English follows the app's en-CA formatting, hence the Canadian flag.
    { value: 'en', label: 'English', code: 'EN', Flag: CanadaFlag },
  ];

/** A button with the current language's flag; it opens a small menu with both languages. */
export function LanguageSwitch({
  language,
  onChange,
  tone = 'light',
}: {
  language: ShowcaseLanguage;
  onChange: (language: ShowcaseLanguage) => void;
  tone?: 'light' | 'dark';
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const t = stringsFor(language);
  const current = OPTIONS.find((o) => o.value === language) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !box.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!current) return null;
  const dark = tone === 'dark';
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.languageLabel}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] pr-3 pl-2.5 text-sm font-bold',
          dark
            ? 'border-white/20 bg-white/5 text-[#F6EEDD] hover:bg-white/10'
            : 'border-black/10 bg-white text-ink hover:bg-black/[0.03]',
        )}
      >
        <span className="inline-flex overflow-hidden rounded-[4px] ring-1 ring-black/10">
          <current.Flag />
        </span>
        {current.code}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t.language}
          className={cn(
            'absolute top-12 right-0 z-30 flex w-56 flex-col gap-0.5 rounded-2xl p-1.5 shadow-[var(--shadow-pop)]',
            dark ? 'border border-white/15 bg-[#231B3D] text-[#F6EEDD]' : 'bg-white text-ink',
          )}
        >
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === language}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                'flex h-11 items-center gap-2.5 rounded-xl px-3 text-left text-[15px] font-semibold',
                dark ? 'hover:bg-white/10' : 'hover:bg-mist',
              )}
            >
              <span className="inline-flex overflow-hidden rounded-[4px] ring-1 ring-black/10">
                <option.Flag />
              </span>
              <span className="flex-1">{option.label}</span>
              {option.value === language && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
