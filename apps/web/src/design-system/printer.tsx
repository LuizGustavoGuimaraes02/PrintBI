/**
 * Components drawn from the printer itself. Motion runs only when the viewer has
 * not asked for reduced motion (`motion-safe:`); otherwise each shows a still frame.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { cn } from './cn';

/** A nozzle travels over the bed laying down a line: the app-wide loading state. */
export function NozzleLoader({
  label = 'Loading',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" className={cn('flex flex-col items-center gap-3', className)}>
      <svg width="200" height="100" viewBox="0 0 260 130" aria-hidden="true">
        <line
          x1="8"
          y1="112"
          x2="252"
          y2="112"
          stroke="var(--color-rule)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M42 104 H218"
          stroke="var(--color-teal)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="176"
          className="motion-safe:animate-pb-draw"
        />
        <g className="motion-safe:animate-pb-move">
          <line
            x1="42"
            y1="0"
            x2="42"
            y2="44"
            stroke="var(--color-teal)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="4 4"
            className="motion-safe:animate-pb-feed"
          />
          <rect x="24" y="44" width="36" height="26" rx="6" fill="var(--color-ink)" />
          <rect x="30" y="50" width="24" height="4" rx="2" fill="var(--color-steel)" />
          <path d="M34 70 H50 L44 96 H40 Z" fill="var(--color-hot)" />
        </g>
      </svg>
      <span className="label-mono text-ink-muted">{label}</span>
    </div>
  );
}

/** Full-area loading state for pages and panels. */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <NozzleLoader label={label} />
    </div>
  );
}

interface SpoolGaugeProps {
  /** Grams (or units) left. */
  remaining: number;
  capacity: number;
  /** The spool's real color: one stop, or several for multi-color filament. */
  color: string | string[];
  size?: number;
  spinning?: boolean;
  label?: string;
}

/** The wound filament thins as it is used, drawn in the spool's own color. */
export function SpoolGauge({
  remaining,
  capacity,
  color,
  size = 104,
  spinning = true,
  label,
}: SpoolGaugeProps) {
  const ratio = capacity > 0 ? Math.max(0, Math.min(1, remaining / capacity)) : 0;
  const hub = 14;
  const max = 44;
  const outer = hub + (max - hub) * ratio;
  const percent = Math.round(ratio * 100);
  const gradientId = useId();
  const stops = Array.isArray(color) ? color : [color];
  const fill = stops.length > 1 ? `url(#${gradientId})` : (stops[0] ?? 'var(--color-steel)');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 104 104"
      role="img"
      aria-label={label ?? `Spool with ${percent}% left`}
    >
      {stops.length > 1 && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            {stops.map((stop, i) => (
              <stop key={stop + i} offset={`${(i / (stops.length - 1)) * 100}%`} stopColor={stop} />
            ))}
          </linearGradient>
        </defs>
      )}
      <g
        className={cn(spinning && 'motion-safe:animate-pb-spin')}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' } as CSSProperties}
      >
        <circle
          cx="52"
          cy="52"
          r="48"
          fill="var(--color-surface)"
          stroke="var(--color-rule)"
          strokeWidth="3"
        />
        {ratio > 0 && (
          <>
            <circle
              cx="52"
              cy="52"
              r={(hub + outer) / 2}
              fill="none"
              stroke={fill}
              strokeWidth={outer - hub}
            />
            <circle
              cx="52"
              cy="52"
              r={(hub + outer) / 2}
              fill="none"
              stroke="rgb(255 255 255 / 0.18)"
              strokeWidth={outer - hub}
              strokeDasharray="1 5"
            />
          </>
        )}
        <circle
          cx="52"
          cy="52"
          r="12"
          fill="var(--color-surface)"
          stroke="var(--color-rule)"
          strokeWidth="2"
        />
        <circle cx="52" cy="44" r="2.5" fill="var(--color-rule)" />
        <circle cx="59" cy="56" r="2.5" fill="var(--color-rule)" />
        <circle cx="45" cy="56" r="2.5" fill="var(--color-rule)" />
      </g>
    </svg>
  );
}

interface FilamentBarProps {
  value: number;
  max: number;
  /** Fill color: a spool color, or the teal/hot tones. */
  color?: string;
  label: string;
  readout: ReactNode;
  attention?: boolean;
}

/** Stock level or job progress as a strand of filament. */
export function FilamentBar({ value, max, color, label, readout, attention }: FilamentBarProps) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="figure flex justify-between gap-3 text-[13px]">
        <span>{label}</span>
        <span className={cn(attention && 'font-semibold text-hot-ink')}>{readout}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="h-3.5 rounded-full border border-rule bg-surface p-px"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${percent}%`,
            background: attention ? 'var(--color-hot)' : (color ?? 'var(--color-teal)'),
          }}
        />
      </div>
    </div>
  );
}

/** Idle nozzle over an empty bed: the empty state. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] bg-bench px-6 py-10 text-center">
      <svg width="200" height="88" viewBox="0 0 240 104" aria-hidden="true">
        <rect x="30" y="84" width="180" height="10" rx="5" fill="var(--color-rule)" />
        <line
          x1="120"
          y1="0"
          x2="120"
          y2="24"
          stroke="var(--color-teal)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <g className="motion-safe:animate-pb-idle">
          <rect x="102" y="24" width="36" height="26" rx="6" fill="var(--color-ink)" />
          <path d="M112 50 H128 L122 70 H118 Z" fill="var(--color-steel)" />
        </g>
      </svg>
      <h3 className="text-lg font-bold">{title}</h3>
      {children && <p className="max-w-md text-[15px] text-ink-muted">{children}</p>}
      {action}
    </div>
  );
}

/** Stacked layers: success mark for completed actions. */
export function LayersMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect x="4" y="26" width="28" height="4" rx="2" fill="var(--color-steel)" />
      <rect x="11" y="20" width="14" height="5" rx="2" fill="var(--color-glow)" />
      <rect x="13" y="14" width="10" height="5" rx="2" fill="var(--color-glow)" />
      <rect x="15" y="8" width="6" height="5" rx="2" fill="var(--color-glow)" />
    </svg>
  );
}

/** The PrintBI mark: a spool seen from the side. */
export function SpoolMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="12.5" fill="none" stroke="var(--color-steel)" strokeWidth="2" />
      <circle cx="14" cy="14" r="8" fill="none" stroke="var(--color-glow)" strokeWidth="6" />
      <circle
        cx="14"
        cy="14"
        r="3"
        fill="var(--color-ink)"
        stroke="var(--color-steel)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
