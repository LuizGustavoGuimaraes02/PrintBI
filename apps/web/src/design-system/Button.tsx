import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'soft' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-teal text-white hover:bg-teal-strong',
  soft: 'bg-teal-soft text-teal-ink hover:bg-[#d3eaee]',
  ghost: 'bg-transparent text-ink-muted hover:bg-bench hover:text-ink',
  danger: 'bg-hot text-white hover:bg-hot-ink',
};

const SIZES: Record<Size, string> = {
  md: 'h-12 px-6 text-[15px]',
  sm: 'h-10 px-4 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <ExtrudingDots /> : icon}
      {children}
    </button>
  );
}

/** Three filament beads laid down one after another: the in-button loading state. */
function ExtrudingDots() {
  return (
    <span aria-hidden="true" className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-current motion-safe:animate-pulse"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Spoken and shown as a tooltip: icon buttons have no visible text. */
  label: string;
  children: ReactNode;
}

/** A round, solid icon button that stays visible on photos and busy rows. */
export function IconButton({
  label,
  children,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full border border-rule-soft bg-surface text-ink shadow-sm transition-colors hover:bg-teal-soft hover:text-teal-ink disabled:pointer-events-none disabled:opacity-35',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
