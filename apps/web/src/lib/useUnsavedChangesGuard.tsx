import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from '../design-system';

/**
 * Warns before leaving a form with unsaved changes: in-app navigation shows a dialog,
 * closing or reloading the tab shows the browser's own prompt.
 * Call `allowLeave()` right before navigating away after a successful save.
 */
export function useUnsavedChangesGuard(isDirty: boolean): {
  prompt: ReactNode;
  allowLeave: () => void;
} {
  const allowed = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && !allowed.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const allowLeave = useCallback(() => {
    allowed.current = true;
  }, []);

  const prompt = (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => !open && blocker.reset?.()}
      title="Discard your changes?"
      description="You have changes on this page that are not saved yet."
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      tone="danger"
      onConfirm={() => blocker.proceed?.()}
    />
  );
  return { prompt, allowLeave };
}
