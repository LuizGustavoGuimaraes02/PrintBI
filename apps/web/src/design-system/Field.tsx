import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

interface FieldFrameProps {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean;
  className?: string;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
}

/** Label, control, hint and error, wired together for screen readers. */
export function FieldFrame({ label, hint, error, required, className, children }: FieldFrameProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="label-mono text-ink-muted">
        {label}
        {required && (
          <span className="text-hot" aria-hidden="true">
            {' '}
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children({ inputId, describedBy })}
      {hint && !error && (
        <p id={hintId} className="text-[13px] text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[13px] font-semibold text-hot-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const control =
  'w-full min-w-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-steel disabled:cursor-not-allowed';

const frame = (error?: string) =>
  cn(
    'flex items-center gap-2 rounded-[var(--radius-field)] border-2 bg-surface px-4 transition-colors',
    'focus-within:border-teal focus-within:shadow-[0_0_0_4px_rgb(11_110_124/0.12)]',
    error ? 'border-hot' : 'border-rule',
  );

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  suffix?: ReactNode;
  /** Numbers, weights and amounts use the mono face. */
  mono?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({
  label,
  hint,
  error,
  suffix,
  mono,
  required,
  className,
  ref,
  ...rest
}: TextFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error} required={required} className={className}>
      {({ inputId, describedBy }) => (
        <div className={cn(frame(error), 'h-12')}>
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            required={required}
            className={cn(control, mono && 'figure')}
            {...rest}
          />
          {suffix && <span className="figure shrink-0 text-sm text-ink-muted">{suffix}</span>}
        </div>
      )}
    </FieldFrame>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  ref?: Ref<HTMLSelectElement>;
}

export function SelectField({
  label,
  hint,
  error,
  required,
  className,
  children,
  ref,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error} required={required} className={className}>
      {({ inputId, describedBy }) => (
        <div className={cn(frame(error), 'h-12 pr-3')}>
          <select
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            required={required}
            className={cn(control, 'h-full cursor-pointer appearance-none')}
            {...rest}
          >
            {children}
          </select>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
            className="shrink-0 text-ink-muted"
          >
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
    </FieldFrame>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  className,
  rows = 4,
  ref,
  ...rest
}: TextAreaFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error} required={required} className={className}>
      {({ inputId, describedBy }) => (
        <div className={cn(frame(error), 'py-3')}>
          <textarea
            ref={ref}
            id={inputId}
            rows={rows}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            required={required}
            className={cn(control, 'resize-y')}
            {...rest}
          />
        </div>
      )}
    </FieldFrame>
  );
}
