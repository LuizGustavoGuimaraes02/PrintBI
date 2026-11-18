import { Search } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

const MAX_RESULTS = 40;

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Keeps the items whose text contains every typed word ("bambu a1", "silk gold"). */
export function matchWords<T>(
  items: T[],
  query: string,
  text: (item: T) => string,
  limit = MAX_RESULTS,
): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matched =
    words.length === 0
      ? items
      : items.filter((item) => words.every((w) => fold(text(item)).includes(w)));
  return matched.slice(0, limit);
}

interface SearchComboboxProps<T> {
  label: string;
  placeholder: string;
  listLabel: string;
  items: T[];
  search: (items: T[], query: string) => T[];
  getId: (item: T) => string;
  renderOption: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  emptyText: string;
  hint?: ReactNode;
}

/** Accessible search-as-you-type list (ARIA combobox): arrows to move, Enter to pick, Esc to close. */
export function SearchCombobox<T>({
  label,
  placeholder,
  listLabel,
  items,
  search,
  getId,
  renderOption,
  onSelect,
  emptyText,
  hint,
}: SearchComboboxProps<T>) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => search(items, query), [items, query, search]);

  const choose = (item: T) => {
    onSelect(item);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && open && results[active]) {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const activeItem = results[active];
  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="label-mono text-ink-muted">
        {label}
      </label>
      <div className="flex h-12 items-center gap-2 rounded-[var(--radius-field)] border-2 border-rule bg-surface px-4 focus-within:border-teal focus-within:shadow-[0_0_0_4px_rgb(11_110_124/0.12)]">
        <Search size={18} aria-hidden="true" className="shrink-0 text-steel" />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeItem ? `${listId}-${getId(activeItem)}` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="w-full min-w-0 bg-transparent text-[16px] outline-none placeholder:text-steel"
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={listLabel}
          className="absolute top-full right-0 left-0 z-10 mt-2 max-h-72 overflow-y-auto rounded-[18px] bg-surface p-2 shadow-[var(--shadow-pop)]"
        >
          {results.length === 0 && (
            <li className="px-3 py-3 text-sm text-ink-muted">{emptyText}</li>
          )}
          {results.map((item, index) => (
            <li
              key={getId(item)}
              id={`${listId}-${getId(item)}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(item)}
              className={cn(
                'flex cursor-pointer flex-col rounded-xl px-3 py-2.5',
                index === active && 'bg-bench',
              )}
            >
              {renderOption(item)}
            </li>
          ))}
        </ul>
      )}
      {hint && <p className="text-[13px] text-ink-muted">{hint}</p>}
    </div>
  );
}

interface SelectedCardProps {
  label: string;
  title: string;
  detail: string;
  removeLabel: string;
  onRemove: () => void;
  note?: string;
}

/** What a combobox picked, with a way to undo it and type by hand instead. */
export function SelectedCard({
  label,
  title,
  detail,
  removeLabel,
  onRemove,
  note,
}: SelectedCardProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-mono text-ink-muted">{label}</span>
      <div className="flex items-center gap-3 rounded-[var(--radius-field)] border-2 border-teal bg-teal-soft/40 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <strong>{title}</strong>
          <span className="figure truncate text-[13px] text-ink-muted">{detail}</span>
        </div>
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d="M4.5 4.5l9 9M13.5 4.5l-9 9"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {note && <p className="text-[13px] text-ink-muted">{note}</p>}
    </div>
  );
}
