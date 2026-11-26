import type { InventoryItemView } from '@printbi/shared';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { cn, SpoolGauge } from '../../design-system';
import { filamentStops } from '../../design-system/ColorSwatch';
import { showGrams } from '../../lib/quantity';
import { useInventoryItems } from '../inventory/queries';

const FIRST = 3;

interface SpoolPickerProps {
  /** Picked inventory item ids. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** What the print file says ("PLA Matte, PETG"): matching rolls are listed first, never picked. */
  fileMaterial?: string;
}

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter(Boolean);

/**
 * The rolls in stock as spools in their own color. The person taps the roll they actually
 * loaded (two or more for a multicolor print): slicer settings rarely name the real roll.
 */
export function SpoolPicker({ value, onChange, fileMaterial = '' }: SpoolPickerProps) {
  const { data: items = [], isPending } = useInventoryItems({ kind: 'filament' });
  const [all, setAll] = useState(false);
  const wanted = new Set(words(fileMaterial));
  const matches = (item: InventoryItemView) =>
    Boolean(item.filament && wanted.has(item.filament.materialType.toLowerCase()));

  const rolls = items
    .filter((i) => !i.archived && (i.remaining > 0 || value.includes(i.id)))
    .sort((a, b) => Number(matches(b)) - Number(matches(a)) || b.remaining - a.remaining);
  // Picked rolls always stay in view, even past the first few.
  const shown = all ? rolls : rolls.filter((r, i) => i < FIRST || value.includes(r.id));
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  if (isPending) return <p className="px-2.5 py-2 text-[14px] text-ink-muted">Loading rolls…</p>;
  if (rolls.length === 0) {
    return (
      <p className="px-2.5 py-2 text-[14px] text-ink-muted">
        No filament in stock yet.{' '}
        <Link to="/inventory" className="font-semibold text-teal">
          Add rolls
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {wanted.size > 0 && value.length === 0 && (
        <p className="px-2.5 pb-1 text-[13px] text-ink-muted">
          The file says {fileMaterial}. Tap the roll you loaded.
        </p>
      )}
      <ul className="flex flex-col gap-1" aria-label="Rolls in stock">
        {shown.map((item) => {
          const on = value.includes(item.id);
          const capacity = item.lots
            .filter((l) => l.status !== 'archived')
            .reduce((sum, l) => sum + l.originalQuantity, 0);
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(item.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border-2 px-2 py-1.5 text-left',
                  on ? 'border-teal bg-teal-soft/50' : 'border-transparent hover:bg-bench',
                )}
              >
                <SpoolGauge
                  remaining={item.remaining}
                  capacity={capacity}
                  color={filamentStops(item.filament)}
                  size={34}
                  spinning={false}
                  label={`${item.name} spool`}
                />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                  {item.name}
                </span>
                <span className="figure shrink-0 text-[12px] text-ink-muted">
                  {showGrams(item.remaining)} left
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-full border-2',
                    on ? 'border-teal bg-teal text-white' : 'border-rule',
                  )}
                >
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {rolls.length > FIRST && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="self-start rounded-full px-2.5 py-1 text-[13px] font-semibold text-teal hover:bg-bench"
        >
          {all ? 'Show fewer' : `Show all ${rolls.length} rolls`}
        </button>
      )}
    </div>
  );
}
