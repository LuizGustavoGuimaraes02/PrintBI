import { LABEL_COLORS, type LabelView } from '@printbi/shared';
import { Check, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, cn, useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { useRefreshCatalog } from './queries';

/** A label as a soft colored tag; the dark text stays readable on every preset color. */
export function LabelChip({
  label,
  className,
}: {
  label: { name: string; color: string };
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center rounded-full px-3 text-[13px] font-semibold text-ink',
        className,
      )}
      style={{ background: label.color }}
    >
      {label.name}
    </span>
  );
}

/** Preset color buttons shared by the picker and the manage dialog. */
export function LabelColorChoice({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (color: string) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={`Color for ${name}`} className="flex flex-wrap gap-1.5">
      {LABEL_COLORS.map((color, i) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value.toUpperCase() === color}
          aria-label={`Color ${i + 1}`}
          onClick={() => onChange(color)}
          className={cn(
            'grid size-8 place-items-center rounded-full border border-rule',
            value.toUpperCase() === color && 'ring-2 ring-teal ring-offset-2',
          )}
          style={{ background: color }}
        >
          {value.toUpperCase() === color && (
            <Check size={14} aria-hidden="true" className="text-ink" />
          )}
        </button>
      ))}
    </div>
  );
}

interface LabelPickerProps {
  labels: LabelView[];
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string | undefined;
}

/**
 * Toggle the labels a product carries, or create a new one on the spot.
 * Archived labels only show while a product still carries them.
 */
export function LabelPicker({ labels, value, onChange, error }: LabelPickerProps) {
  const toast = useToast();
  const refresh = useRefreshCatalog();
  const inputId = useId();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(LABEL_COLORS[1]);
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const shown = labels.filter((l) => !l.archived || value.includes(l.id));
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setProblem('Name the label');
    const existing = labels.find(
      (l) => !l.archived && l.name.localeCompare(trimmed, undefined, { sensitivity: 'base' }) === 0,
    );
    if (existing) {
      if (!value.includes(existing.id)) onChange([...value, existing.id]);
      setName('');
      return;
    }
    setCreating(true);
    try {
      const label = await api.post<LabelView>('/labels', { name: trimmed, color });
      await refresh();
      onChange([...value, label.id]);
      setName('');
      setProblem(null);
      setColor(
        LABEL_COLORS[(LABEL_COLORS.indexOf(color as never) + 1) % LABEL_COLORS.length] ?? color,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setProblem(e.message);
      else toast.error('Label not created', e instanceof ApiError ? e.message : undefined);
    } finally {
      setCreating(false);
    }
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-2 text-sm font-semibold">Labels</legend>
      {shown.length > 0 ? (
        <div role="group" aria-label="Choose labels" className="flex flex-wrap gap-2">
          {shown.map((label) => {
            const on = value.includes(label.id);
            return (
              <button
                key={label.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(label.id)}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[14px] font-semibold',
                  on ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink',
                )}
                style={{ background: label.color }}
              >
                {on && <Check size={14} aria-hidden="true" />}
                {label.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          No labels yet. Labels group your work (Keychain, Fridge magnet, Vase) in lists, sales and
          the showcase.
        </p>
      )}
      <div className="flex flex-col gap-2 rounded-[var(--radius-tile)] bg-bench p-3">
        <label htmlFor={inputId} className="text-[13px] font-semibold text-ink-muted">
          New label
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={inputId}
            value={name}
            maxLength={40}
            placeholder="e.g. Keychain"
            aria-invalid={problem ? true : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setProblem(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
            }}
            className="h-10 min-w-40 flex-1 rounded-full border-[1.5px] border-rule bg-surface px-4 outline-none focus:border-teal"
          />
          <Button
            variant="soft"
            size="sm"
            loading={creating}
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => void create()}
          >
            Add label
          </Button>
        </div>
        <LabelColorChoice value={color} onChange={setColor} name="the new label" />
        {(problem ?? error) && (
          <p role="alert" className="text-[13px] font-semibold text-hot-ink">
            {problem ?? error}
          </p>
        )}
      </div>
    </fieldset>
  );
}
