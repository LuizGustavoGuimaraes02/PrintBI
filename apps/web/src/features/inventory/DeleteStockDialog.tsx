import {
  formatMoney,
  type InventoryItemView,
  type InventoryLotView,
  type StockDeletePreviewView,
} from '@printbi/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmDialog, useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { useCan } from '../auth/account';

interface DeleteStockDialogProps {
  item: InventoryItemView;
  /** One roll; without it the whole item is deleted. */
  lot?: InventoryLotView;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Deletes a stock item or one roll entered by mistake. It first shows what goes with it (rolls,
 * history, linked expenses) and offers to delete the expense that paid only for it.
 */
export function DeleteStockDialog({ item, lot, onClose, onDeleted }: DeleteStockDialogProps) {
  const toast = useToast();
  const canManageFinance = useCan('finance:manage');
  const [deleteExpenses, setDeleteExpenses] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const { data: preview } = useQuery({
    queryKey: ['inventory', 'delete-preview', item.id, lot?.id ?? null],
    queryFn: () =>
      api.get<StockDeletePreviewView>(
        `/inventory/items/${item.id}/delete-preview${lot ? `?lotId=${lot.id}` : ''}`,
      ),
    gcTime: 0,
  });

  const own = preview?.expenses.filter((e) => !e.shared) ?? [];
  const shared = preview?.expenses.filter((e) => e.shared) ?? [];
  const what = lot ? `${item.name} · ${lot.label}` : item.name;

  const confirm = async () => {
    setDeleting(true);
    try {
      const expenses = deleteExpenses && canManageFinance && own.length > 0 ? 'delete' : 'keep';
      const path = lot
        ? `/inventory/items/${item.id}/lots/${lot.id}`
        : `/inventory/items/${item.id}`;
      await api.delete(`${path}?expenses=${expenses}`);
      toast.success(lot ? 'Roll deleted' : 'Item deleted', what);
      await onDeleted();
      onClose();
    } catch (error) {
      toast.error('Not deleted', error instanceof ApiError ? error.message : undefined);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={lot ? `Delete ${lot.label}?` : `Delete ${item.name}?`}
      description={
        preview
          ? `This removes ${lot ? 'this roll' : plural(preview.lots, 'roll', 'rolls')} and ${plural(preview.movements, 'history entry', 'history entries')} for good. Use it for something entered by mistake; to keep the history, archive instead.`
          : 'Checking what goes with it…'
      }
      confirmLabel={lot ? 'Delete roll' : 'Delete item'}
      tone="danger"
      loading={deleting || !preview}
      onConfirm={() => void confirm()}
    >
      {preview && preview.linkedExpenseCount > 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-tile)] bg-bench p-4 text-sm">
          {own.length > 0 && canManageFinance && (
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-hot"
                checked={deleteExpenses}
                onChange={(e) => setDeleteExpenses(e.target.checked)}
              />
              <span>
                <span className="font-semibold">
                  Also delete {own.length === 1 ? 'its expense' : `its ${own.length} expenses`}
                </span>
                {own.map((e) => (
                  <span key={e.id} className="figure block text-ink-muted">
                    {e.description} · {formatMoney(e.amount)}
                  </span>
                ))}
              </span>
            </label>
          )}
          {canManageFinance ? (
            shared.map((e) => (
              <p key={e.id} className="text-ink-muted">
                <span className="font-semibold text-ink">Kept:</span> {e.description} ·{' '}
                <span className="figure">{formatMoney(e.amount)}</span>. It also paid for other
                rolls, so it only loses the link.
              </p>
            ))
          ) : (
            <p className="text-ink-muted">
              {plural(preview.linkedExpenseCount, 'linked expense stays', 'linked expenses stay')}.
              Someone who manages finances can delete{' '}
              {preview.linkedExpenseCount === 1 ? 'it' : 'them'}.
            </p>
          )}
        </div>
      )}
    </ConfirmDialog>
  );
}
