import { AlertDialog, Dialog as RadixDialog } from 'radix-ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { cn } from './cn';

const overlay = 'fixed inset-0 z-40 bg-ink/40 motion-safe:animate-fade-in';
const content =
  'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-x-hidden overflow-y-auto rounded-[var(--radius-card)] bg-surface p-6 shadow-[var(--shadow-pop)] outline-none motion-safe:animate-pop-in md:p-8';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg';
}

/** Centered card that opens smoothly. Focus is trapped and returns on close. */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'md',
}: ModalProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={overlay} />
        <RadixDialog.Content className={cn(content, width === 'lg' ? 'max-w-3xl' : 'max-w-xl')}>
          <header className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <RadixDialog.Title className="text-2xl font-extrabold tracking-[-0.02em]">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="text-ink-muted">
                  {description}
                </RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="grid size-10 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-bench hover:text-ink"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </RadixDialog.Close>
          </header>
          {children}
          {footer && <footer className="flex flex-wrap justify-end gap-3 pt-1">{footer}</footer>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  /** Extra content between the description and the buttons, such as an option. */
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlay} />
        <AlertDialog.Content className={cn(content, 'max-w-md')}>
          <AlertDialog.Title className="text-xl font-extrabold tracking-[-0.02em]">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-ink-muted">
            {description}
          </AlertDialog.Description>
          {children}
          <div className="flex flex-wrap justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
