import type { LabelView } from '@printbi/shared';
import { useState } from 'react';
import { Button, cn, Modal, useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { LabelChip, LabelColorChoice } from './LabelPicker';
import { useLabels, useRefreshCatalog } from './queries';

/** Rename, recolor, archive or restore labels. Archiving keeps them on existing products. */
export function ManageLabelsDialog({ onClose }: { onClose: () => void }) {
  const { data: labels } = useLabels();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Labels"
      description="Shared by products, sales filters and the showcase."
      width="lg"
    >
      {labels && labels.length === 0 && (
        <p className="text-ink-muted">Create labels while adding a product or service.</p>
      )}
      <ul className="flex flex-col divide-y divide-rule-soft">
        {labels?.map((label) =>
          editing === label.id ? (
            <LabelEditor key={label.id} label={label} onDone={() => setEditing(null)} />
          ) : (
            <LabelRow key={label.id} label={label} onEdit={() => setEditing(label.id)} />
          ),
        )}
      </ul>
    </Modal>
  );
}

function useUpdateLabel(label: LabelView) {
  const toast = useToast();
  const refresh = useRefreshCatalog();
  return async (patch: Partial<{ name: string; color: string; archived: boolean }>) => {
    try {
      await api.patch(`/labels/${label.id}`, patch);
      await refresh();
      return null;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.status === 400)) return e.message;
      toast.error('Label not saved', e instanceof ApiError ? e.message : undefined);
      return 'Not saved';
    }
  };
}

function LabelRow({ label, onEdit }: { label: LabelView; onEdit: () => void }) {
  const toast = useToast();
  const update = useUpdateLabel(label);
  const [busy, setBusy] = useState(false);
  const toggleArchived = async () => {
    setBusy(true);
    const problem = await update({ archived: !label.archived });
    setBusy(false);
    if (problem) toast.error('Not restored', problem);
  };
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <LabelChip label={label} className={cn(label.archived && 'opacity-60')} />
      <span className="figure flex-1 text-[13px] text-ink-muted">
        {label.archived
          ? 'Archived'
          : `${label.productCount} ${label.productCount === 1 ? 'product' : 'products'}`}
      </span>
      {!label.archived && (
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      )}
      <Button variant="ghost" size="sm" loading={busy} onClick={() => void toggleArchived()}>
        {label.archived ? 'Restore' : 'Archive'}
      </Button>
    </li>
  );
}

function LabelEditor({ label, onDone }: { label: LabelView; onDone: () => void }) {
  const update = useUpdateLabel(label);
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) return setProblem('Name the label');
    setSaving(true);
    const result = await update({ name: name.trim(), color });
    setSaving(false);
    if (result) setProblem(result);
    else onDone();
  };
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={`Name of ${label.name}`}
          value={name}
          maxLength={40}
          onChange={(e) => {
            setName(e.target.value);
            setProblem(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') {
              e.stopPropagation();
              onDone();
            }
          }}
          className="h-10 min-w-40 flex-1 rounded-full border-[1.5px] border-rule bg-surface px-4 outline-none focus:border-teal"
        />
        <Button size="sm" loading={saving} onClick={() => void save()}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <LabelColorChoice value={color} onChange={setColor} name={label.name} />
      {problem && (
        <p role="alert" className="text-[13px] font-semibold text-hot-ink">
          {problem}
        </p>
      )}
    </li>
  );
}
