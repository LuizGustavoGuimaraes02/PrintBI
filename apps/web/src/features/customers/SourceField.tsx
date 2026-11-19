import type { CustomerSourceView } from '@printbi/shared';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, SelectField, useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { useCustomerSources, useRefreshCustomers } from './queries';

const NEW = '__new__';

interface SourceFieldProps {
  value: string | null;
  onChange: (id: string | null) => void;
  error?: string | undefined;
}

/**
 * Where the customer came from. The last option opens a small input to add a new source
 * (Facebook, Flyer, Fair...) without leaving the form.
 */
export function SourceField({ value, onChange, error }: SourceFieldProps) {
  const toast = useToast();
  const refresh = useRefreshCustomers();
  const { data: sources } = useCustomerSources();
  const inputId = useId();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Archived sources stay visible only for the customer that already has one.
  const shown = sources?.filter((s) => !s.archived || s.id === value) ?? [];

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setProblem('Name the source');
    const existing = sources?.find(
      (s) => !s.archived && s.name.localeCompare(trimmed, undefined, { sensitivity: 'base' }) === 0,
    );
    if (existing) {
      onChange(existing.id);
      setAdding(false);
      setName('');
      return;
    }
    setSaving(true);
    try {
      const source = await api.post<CustomerSourceView>('/customer-sources', { name: trimmed });
      await refresh();
      onChange(source.id);
      setAdding(false);
      setName('');
      setProblem(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setProblem(e.message);
      else toast.error('Source not added', e instanceof ApiError ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <SelectField
        label="Came from"
        value={adding ? NEW : (value ?? '')}
        error={error}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setAdding(true);
            return;
          }
          setAdding(false);
          onChange(e.target.value || null);
        }}
      >
        <option value="">Not sure</option>
        {shown.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value={NEW}>+ New source…</option>
      </SelectField>
      {adding && (
        <div className="flex flex-col gap-1.5 rounded-[var(--radius-tile)] bg-bench p-3">
          <label htmlFor={inputId} className="text-[13px] font-semibold text-ink-muted">
            New source
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id={inputId}
              autoFocus
              value={name}
              maxLength={40}
              placeholder="e.g. Facebook, Flyer"
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
              className="h-10 min-w-36 flex-1 rounded-full border-[1.5px] border-rule bg-surface px-4 outline-none focus:border-teal"
            />
            <Button
              size="sm"
              variant="soft"
              loading={saving}
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() => void create()}
            >
              Add
            </Button>
          </div>
          {problem && (
            <p role="alert" className="text-[13px] font-semibold text-hot-ink">
              {problem}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
