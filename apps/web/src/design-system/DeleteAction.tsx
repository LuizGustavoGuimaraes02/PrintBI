import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { ConfirmDialog } from './Dialog';

interface DeleteActionProps {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Runs the delete; throw to keep the dialog open (the caller reports the error). */
  onDelete: () => Promise<void>;
  label?: string;
  size?: 'md' | 'sm';
}

/** A quiet "Delete" button that asks first. For records entered by mistake. */
export function DeleteAction({
  title,
  description,
  confirmLabel,
  onDelete,
  label = 'Delete',
  size = 'md',
}: DeleteActionProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await onDelete();
      setOpen(false);
    } catch {
      // The caller already told the person what went wrong; the dialog stays for another try.
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        variant="ghost"
        size={size}
        className="text-hot-ink hover:bg-hot-soft hover:text-hot-ink"
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        tone="danger"
        loading={busy}
        onConfirm={() => void confirm()}
      />
    </>
  );
}
