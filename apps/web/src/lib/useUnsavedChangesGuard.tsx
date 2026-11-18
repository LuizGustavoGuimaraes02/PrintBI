import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from '../design-system';

/**
 * Warns before leaving a form with unsaved changes: in-app navigation shows a
 * dialog, closing or reloading the tab shows the browser's own prompt.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  return (
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
}
