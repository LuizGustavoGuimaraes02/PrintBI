import { COLOR_FAMILIES, findColor, searchColors, type ColorFamily } from '@printbi/shared';
import { useMemo, useState } from 'react';
import { ColorSwatch, cn, TextField } from '../../design-system';

export interface ColorValue {
  colorKey: string;
  colorName: string;
  colorHex: string;
}

interface ColorPickerProps {
  value: ColorValue;
  onChange: (value: ColorValue) => void;
  error?: string | undefined;
}

const FAMILY_LABEL: Record<ColorFamily, string> = {
  white: 'White',
  gray: 'Gray',
  black: 'Black',
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
  brown: 'Brown',
  metallic: 'Metallic',
  multi: 'Multi-color',
  clear: 'Clear',
};

/**
 * Filament color: search the full catalog (silk, neon, glow, rainbow...), filter by family,
 * or define a custom color. The chosen color drives every spool gauge in the app.
 */
export function ColorPicker({ value, onChange, error }: ColorPickerProps) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<ColorFamily | ''>('');
  const [custom, setCustom] = useState(!value.colorKey && Boolean(value.colorHex));
  const selected = findColor(value.colorKey);

  const colors = useMemo(
    () => searchColors(query).filter((color) => !family || color.family === family),
    [query, family],
  );

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="label-mono mb-1 text-ink-muted">
        Color{' '}
        <span className="text-hot" aria-hidden="true">
          *
        </span>
      </legend>
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-tile)] bg-bench px-4 py-3">
        <ColorSwatch
          stops={selected?.stops ?? [value.colorHex || '#d5dcdf']}
          finish={selected?.finish}
          size={32}
        />
        <span className="flex flex-col">
          <strong>{value.colorName || 'No color chosen yet'}</strong>
          <span className="figure text-[12px] text-ink-muted">
            {selected
              ? `${selected.finish} · ${FAMILY_LABEL[selected.family]}`
              : value.colorHex
                ? `custom · ${value.colorHex}`
                : 'pick below'}
          </span>
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setCustom(!custom);
            if (!custom)
              onChange({
                colorKey: '',
                colorName: value.colorName,
                colorHex: value.colorHex || '#888888',
              });
          }}
          className="text-sm font-semibold text-teal hover:text-teal-strong"
        >
          {custom ? 'Choose from the catalog' : 'Custom color'}
        </button>
      </div>

      {custom ? (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="label-mono text-ink-muted">Swatch</span>
            <input
              type="color"
              value={value.colorHex || '#888888'}
              onChange={(e) =>
                onChange({
                  colorKey: '',
                  colorName: value.colorName,
                  colorHex: e.target.value.toUpperCase(),
                })
              }
              className="h-12 w-20 cursor-pointer rounded-[var(--radius-field)] border-2 border-rule bg-surface p-1"
            />
          </label>
          <TextField
            label="Color name"
            required
            placeholder="e.g. Galaxy Teal"
            value={value.colorName}
            onChange={(e) => onChange({ ...value, colorKey: '', colorName: e.target.value })}
            error={error}
          />
        </div>
      ) : (
        <>
          <TextField
            label="Search colors"
            placeholder="e.g. silk gold, neon, glow, rainbow"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="flex w-max gap-1.5" role="group" aria-label="Color family">
              {(['', ...COLOR_FAMILIES] as const).map((f) => (
                <button
                  key={f || 'all'}
                  type="button"
                  aria-pressed={family === f}
                  onClick={() => setFamily(f)}
                  className={cn(
                    'h-9 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap',
                    family === f ? 'bg-ink text-white' : 'bg-bench text-ink hover:bg-rule-soft',
                  )}
                >
                  {f ? FAMILY_LABEL[f] : 'All'}
                </button>
              ))}
            </div>
          </div>
          <ul className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto rounded-[var(--radius-tile)] border border-rule-soft p-1.5 sm:grid-cols-3">
            {colors.length === 0 && (
              <li className="col-span-full p-3 text-sm text-ink-muted">
                No color matches. Try a custom color.
              </li>
            )}
            {colors.map((color) => {
              const isSelected = color.key === value.colorKey;
              return (
                <li key={color.key}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      onChange({ colorKey: color.key, colorName: color.name, colorHex: '' })
                    }
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[14px]',
                      isSelected ? 'bg-teal-soft font-semibold text-teal-ink' : 'hover:bg-bench',
                    )}
                  >
                    <ColorSwatch stops={color.stops} finish={color.finish} size={22} />
                    <span className="truncate">{color.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {error && (
            <p className="text-[13px] font-semibold text-hot-ink" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}
