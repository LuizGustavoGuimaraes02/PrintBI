import { useState } from 'react';
import { Button } from './Button';

interface InlineDeleteProps {
  /** What is deleted, for the question: "Delete Keychain?". */
  name: string;
  /** Short consequence shown while asking, e.g. "It comes off 3 products." */
  consequence?: string;
  /** Throw to stay in the asking state (the caller reports the error). */
  onDelete: () => Promise<void>;
}

/**
 * Delete inside a list row: the row itself asks "Delete X?" instead of opening a dialog,
 * which keeps compact lists (and lists already inside a dialog) light.
 */
export function InlineDelete({ name, consequence, onDelete }: InlineDeleteProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-hot-ink hover:bg-hot-soft hover:text-hot-ink"
        onClick={() => setAsking(true)}
      >
        Delete
      </Button>
    );
  }
  const confirm = async () => {
    setBusy(true);
    try {
      await onDelete();
    } catch {
      setBusy(false);
    }
  };
  return (
    <span role="group" aria-label={`Delete ${name}?`} className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-ink">
        <span className="font-semibold">Delete {name}?</span>
        {consequence && <span className="text-ink-muted"> {consequence}</span>}
      </span>
      <Button variant="danger" size="sm" loading={busy} onClick={() => void confirm()} autoFocus>
        Delete
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setAsking(false)}>
        Keep
      </Button>
    </span>
  );
}
