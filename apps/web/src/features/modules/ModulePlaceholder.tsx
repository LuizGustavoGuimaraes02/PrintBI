import { EmptyState, PageHeader } from '../../design-system';

/** Navigation target for modules that are not built yet, stating honestly when they arrive. */
export function ModulePlaceholder({ title, part }: { title: string; part: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title={`${title} is on the build plate`}>
        This module is planned for part {part} of the build. Everything set up in Settings will be
        ready for it.
      </EmptyState>
    </>
  );
}
