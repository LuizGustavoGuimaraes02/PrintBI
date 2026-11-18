import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

/** The white rounded section every screen is built from. */
export function Panel({ title, description, actions, className, children, ...rest }: PanelProps) {
  return (
    <section
      className={cn(
        'flex flex-col gap-5 rounded-[var(--radius-card)] bg-surface p-6 md:p-7',
        className,
      )}
      {...rest}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            {title && <h2 className="text-lg font-bold">{title}</h2>}
            {description && <p className="text-sm text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 px-1">
      <div className="flex flex-col gap-1">
        {eyebrow && <span className="label-mono text-ink-muted">{eyebrow}</span>}
        <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.03em] md:text-[40px]">
          {title}
        </h1>
        {description && <p className="max-w-2xl text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

type Tone = 'neutral' | 'teal' | 'hot';

const TONES: Record<Tone, string> = {
  neutral: 'border border-rule text-ink-muted',
  teal: 'bg-teal-soft text-teal-ink',
  hot: 'bg-hot-soft text-hot-ink',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'label-mono inline-flex h-7 items-center gap-1.5 rounded-full px-3',
        TONES[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Inline message. Attention uses the hot-nozzle color plus words, never color alone. */
export function Notice({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'attention';
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const attention = tone === 'attention';
  return (
    <div
      role={attention ? 'alert' : 'status'}
      className={cn(
        'flex items-center gap-4 rounded-[18px] border-[1.5px] px-5 py-4',
        attention ? 'border-hot-line bg-surface' : 'border-rule-soft bg-bench',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('w-1.5 self-stretch rounded-full', attention ? 'bg-hot' : 'bg-teal')}
      />
      <div className="flex flex-1 flex-col gap-0.5">
        {title && (
          <span className={cn('label-mono', attention ? 'text-hot-ink' : 'text-teal-ink')}>
            {title}
          </span>
        )}
        <div className="text-[15px]">{children}</div>
      </div>
      {action}
    </div>
  );
}
