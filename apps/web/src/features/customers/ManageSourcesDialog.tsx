import type { CustomerSourceView } from '@printbi/shared';
import { useState } from 'react';
import { Button, cn, InlineDelete, Modal, useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { useCustomerSources, useRefreshCustomers } from './queries';

/** Rename, archive or restore sources. Archiving keeps them on existing customers. */
export function ManageSourcesDialog({ onClose }: { onClose: () => void }) {
  const { data: sources } = useCustomerSources();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Where customers come from"
      description="Add new sources while adding a customer. Archived ones stay on the customers that have them."
    >
      <ul className="flex flex-col divide-y divide-rule-soft">
        {sources?.map((source) => (
          <SourceRow
            key={source.id}
            source={source}
            editing={editing === source.id}
            onEdit={(on) => setEditing(on ? source.id : null)}
          />
        ))}
      </ul>
    </Modal>
  );
}

function SourceRow({
  source,
  editing,
  onEdit,
}: {
  source: CustomerSourceView;
  editing: boolean;
  onEdit: (on: boolean) => void;
}) {
  const toast = useToast();
  const refresh = useRefreshCustomers();
  const [name, setName] = useState(source.name);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = async (patch: { name?: string; archived?: boolean }) => {
    setBusy(true);
    try {
      await api.patch(`/customer-sources/${source.id}`, patch);
      await refresh();
      onEdit(false);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Not saved';
      if (patch.name) setProblem(message);
      else toast.error('Not changed', message);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <li className="flex flex-col gap-2 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label={`Name of ${source.name}`}
            value={name}
            maxLength={40}
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
              setProblem(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) void update({ name: name.trim() });
              if (e.key === 'Escape') {
                e.stopPropagation();
                onEdit(false);
              }
            }}
            className="h-10 min-w-40 flex-1 rounded-full border-[1.5px] border-rule bg-surface px-4 outline-none focus:border-teal"
          />
          <Button
            size="sm"
            loading={busy}
            disabled={!name.trim()}
            onClick={() => void update({ name: name.trim() })}
          >
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onEdit(false)}>
            Cancel
          </Button>
        </div>
        {problem && (
          <p role="alert" className="text-[13px] font-semibold text-hot-ink">
            {problem}
          </p>
        )}
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className={cn('font-semibold', source.archived && 'text-ink-muted')}>
        {source.name}
      </span>
      <span className="figure flex-1 text-[13px] text-ink-muted">
        {source.archived
          ? 'Archived'
          : `${source.customerCount} ${source.customerCount === 1 ? 'customer' : 'customers'}`}
      </span>
      {!source.archived && (
        <Button variant="ghost" size="sm" onClick={() => onEdit(true)}>
          Edit
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        loading={busy}
        onClick={() => void update({ archived: !source.archived })}
      >
        {source.archived ? 'Restore' : 'Archive'}
      </Button>
      <InlineDelete
        name={source.name}
        consequence={
          source.customerCount > 0
            ? `${source.customerCount} ${source.customerCount === 1 ? 'customer keeps' : 'customers keep'} everything else, with no source.`
            : undefined
        }
        onDelete={async () => {
          try {
            await api.delete(`/customer-sources/${source.id}`);
            await refresh();
            toast.success('Source deleted', source.name);
          } catch (e) {
            toast.error('Not deleted', e instanceof ApiError ? e.message : undefined);
            throw e;
          }
        }}
      />
    </li>
  );
}
