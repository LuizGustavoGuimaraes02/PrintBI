import { PRINTER_CATALOG_ATTRIBUTION, type PrinterModelView } from '@printbi/shared';
import { Search, X } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { cn } from '../../design-system';

const MAX_RESULTS = 40;

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Every typed word must appear in "brand model" ("bambu a1", "k1 max", "neptune 4"). */
export function searchModels(models: PrinterModelView[], query: string): PrinterModelView[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return models.slice(0, MAX_RESULTS);
  return models
    .filter((m) => words.every((w) => fold(m.fullName).includes(w)))
    .slice(0, MAX_RESULTS);
}

export const modelSummary = (m: PrinterModelView): string =>
  [
    m.typicalNozzleTempC && m.typicalBedTempC
      ? `${m.typicalNozzleTempC} / ${m.typicalBedTempC} °C`
      : null,
    m.buildVolumeMm ? `${m.buildVolumeMm.x}×${m.buildVolumeMm.y}×${m.buildVolumeMm.z} mm` : null,
    m.ratedPowerW ? `${m.ratedPowerW} W rated` : null,
  ]
    .filter(Boolean)
    .join(' · ');

interface PrinterModelPickerProps {
  models: PrinterModelView[];
  selected: PrinterModelView | null;
  onSelect: (model: PrinterModelView | null) => void;
}

/** Accessible combobox over the bundled FDM catalog. Typing a printer by hand stays possible. */
export function PrinterModelPicker({ models, selected, onSelect }: PrinterModelPickerProps) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchModels(models, query), [models, query]);

  const choose = (model: PrinterModelView) => {
    onSelect(model);
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

  if (selected) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="label-mono text-ink-muted">Printer model</span>
        <div className="flex items-center gap-3 rounded-[var(--radius-field)] border-2 border-teal bg-teal-soft/40 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <strong>{selected.fullName}</strong>
            <span className="figure truncate text-[13px] text-ink-muted">
              {modelSummary(selected) || 'Spec sheet attached'}
            </span>
          </div>
          <button
            type="button"
            aria-label={`Remove ${selected.fullName} and enter the printer by hand`}
            onClick={() => onSelect(null)}
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="text-[13px] text-ink-muted">
          The fields below were filled from the catalog. You can still change them.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="label-mono text-ink-muted">
        Find your printer model
      </label>
      <div className="flex h-12 items-center gap-2 rounded-[var(--radius-field)] border-2 border-rule bg-surface px-4 focus-within:border-teal focus-within:shadow-[0_0_0_4px_rgb(11_110_124/0.12)]">
        <Search size={18} aria-hidden="true" className="shrink-0 text-steel" />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && results[active] ? `${listId}-${results[active].id}` : undefined
          }
          autoComplete="off"
          placeholder="e.g. Bambu A1, K1 Max, Neptune 4"
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
          aria-label="Printer models"
          className="absolute top-full right-0 left-0 z-10 mt-2 max-h-72 overflow-y-auto rounded-[18px] bg-surface p-2 shadow-[var(--shadow-pop)]"
        >
          {results.length === 0 && (
            <li className="px-3 py-3 text-sm text-ink-muted">
              No model matches. Fill the fields below by hand.
            </li>
          )}
          {results.map((model, index) => (
            <li
              key={model.id}
              id={`${listId}-${model.id}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(model)}
              className={cn(
                'flex cursor-pointer flex-col rounded-xl px-3 py-2.5',
                index === active && 'bg-bench',
              )}
            >
              <span className="font-semibold">{model.fullName}</span>
              <span className="figure text-[12px] text-ink-muted">{modelSummary(model)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-ink-muted">
        Not in the list? Skip this and fill the fields below by hand. Catalog:{' '}
        <a
          href={PRINTER_CATALOG_ATTRIBUTION.url}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-teal"
        >
          {PRINTER_CATALOG_ATTRIBUTION.name}
        </a>{' '}
        ({PRINTER_CATALOG_ATTRIBUTION.license}).
      </p>
    </div>
  );
}
