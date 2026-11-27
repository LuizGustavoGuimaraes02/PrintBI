import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

/** A filter pill: the native select keeps keyboard and screen-reader behaviour, styled flat. */
export function FilterPill({
  label,
  value,
  onChange,
  empty,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  empty?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        'relative flex h-9 items-center rounded-full border-[1.5px] bg-surface pl-3 text-sm focus-within:border-teal',
        value ? 'border-teal bg-teal-soft text-teal-ink' : 'border-rule',
      )}
    >
      <span className="font-semibold">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full max-w-48 cursor-pointer appearance-none border-0 bg-transparent pr-8 pl-1.5 font-semibold text-ink-muted outline-none"
      >
        <option value="">{empty ?? 'Any'}</option>
        {children}
      </select>
      <ChevronDown
        size={14}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 text-ink-muted"
      />
    </label>
  );
}
