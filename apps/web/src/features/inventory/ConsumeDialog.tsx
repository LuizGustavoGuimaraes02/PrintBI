import {
  consumptionSchema,
  multiply,
  toMicro,
  type InventoryItemView,
  type Money,
  type StockMovementView,
} from '@printbi/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, cn, Modal, Notice, SelectField, TextField, useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { showMoney } from '../../lib/money';
import { showQuantity, unitLabel } from '../../lib/quantity';
import { useIdempotencyKey } from '../../lib/useIdempotencyKey';
import { useCan } from '../auth/account';
import { useRefreshOrders } from '../orders/queries';
import { useInventoryItems, useRefreshInventory } from './queries';

interface Line {
  id: number;
  itemId: string;
  lotId: string;
  quantity: string;
}

/** Lots that can still give stock, fullest first after any already open. */
const usableLots = (item?: InventoryItemView) =>
  (item?.lots ?? [])
    .filter((l) => l.status !== 'archived' && l.remaining > 0)
    .sort(
      (a, b) =>
        Number(b.status === 'in_use') - Number(a.status === 'in_use') || a.remaining - b.remaining,
    );

function parseQuantity(text: string): number | null {
  try {
    const value = toMicro(text.trim());
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

interface ConsumeDialogProps {
  onClose: () => void;
  /** Opens with this item on the first line (from an item page). */
  itemId?: string;
  /** Records the usage against this order (from the order card). */
  order?: { id: string; title: string };
  /** Starting lines, such as the rolls picked for an order with the file's grams. */
  prefill?: { itemId: string; quantity: string }[];
  /** Worded as confirming a finished print from the board. */
  confirmPrint?: boolean;
}

/**
 * Records what a print actually used, or what a failed print wasted, across one or more
 * rolls and consumables. Everything is deducted in one step, or nothing is.
 */
export function ConsumeDialog({
  onClose,
  itemId,
  order,
  prefill,
  confirmPrint,
}: ConsumeDialogProps) {
  const toast = useToast();
  const refreshStock = useRefreshInventory();
  const refreshOrders = useRefreshOrders();
  const refresh = () => Promise.all([refreshStock(), order && refreshOrders()]);
  const canSeeFinance = useCan('finance:view');
  const idempotency = useIdempotencyKey();
  const { data: items = [] } = useInventoryItems({});
  const picked = new Set([itemId, ...(prefill ?? []).map((p) => p.itemId)]);
  const usable = items.filter((i) => usableLots(i).length > 0 || picked.has(i.id));

  const firstLot = (id: string) => usableLots(items.find((i) => i.id === id))[0]?.id ?? '';
  const [type, setType] = useState<'consumption' | 'loss'>('consumption');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>(() =>
    prefill?.length
      ? prefill.map((p, i) => ({ id: i + 1, itemId: p.itemId, lotId: '', quantity: p.quantity }))
      : [{ id: 1, itemId: itemId ?? '', lotId: '', quantity: '' }],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (id: number, patch: Partial<Line>) =>
    setLines((all) => all.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const details = lines.map((line) => {
    const item = items.find((i) => i.id === line.itemId);
    // No roll picked yet: suggest the open one (items may load after the dialog opens).
    const lotId = line.lotId || firstLot(line.itemId);
    const lot = item?.lots.find((l) => l.id === lotId);
    const quantity = parseQuantity(line.quantity);
    const cost: Money | null =
      lot?.unitCost && quantity
        ? { amount: multiply(quantity, lot.unitCost.amount), currency: lot.unitCost.currency }
        : null;
    return {
      line,
      lotId,
      item,
      lot,
      quantity,
      cost,
      tooMuch: Boolean(lot && quantity && quantity > lot.remaining),
    };
  });
  const ready = details.every((d) => d.item && d.lot && d.quantity && !d.tooMuch);

  // Same lot twice would be checked separately; warn so the user merges the lines.
  const lotUse = new Map<string, number>();
  details.forEach(
    (d) => d.lot && d.quantity && lotUse.set(d.lot.id, (lotUse.get(d.lot.id) ?? 0) + d.quantity),
  );
  const overDrawn = details.find((d) => d.lot && (lotUse.get(d.lot.id) ?? 0) > d.lot.remaining);

  const submit = async () => {
    setError(null);
    const payload = {
      type,
      reason,
      lines: details.map((d) => ({
        itemId: d.line.itemId,
        lotId: d.lotId,
        quantity: d.line.quantity,
      })),
    };
    if (!consumptionSchema.safeParse(payload).success || !ready || overDrawn) {
      setError('Complete every line with a quantity the roll can cover.');
      return;
    }
    setSaving(true);
    try {
      const movements = await api.post<StockMovementView[]>(
        order ? `/orders/${order.id}/consumptions` : '/inventory/consumptions',
        payload,
        {
          headers: idempotency.headers,
        },
      );
      idempotency.renew();
      await refresh();
      const first = details[0];
      toast.success(
        type === 'loss' ? 'Loss recorded' : 'Usage recorded',
        movements.length === 1 && first?.item && first.lot
          ? `${first.item.name} ${first.lot.label} · −${showQuantity(-movements[0]!.delta, first.item)} · now ${showQuantity(movements[0]!.balanceAfter, first.item)}`
          : `${movements.length} lines deducted`,
      );
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server.');
      if (e instanceof ApiError && e.code === 'INSUFFICIENT_STOCK') await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        confirmPrint && order
          ? `Confirm print · ${order.title}`
          : order
            ? `Record usage · ${order.title}`
            : 'Record usage'
      }
      description={
        confirmPrint
          ? 'Check the rolls and grams, then deduct them from stock. The grams come from the print file; change them if the print used more or less.'
          : 'Deducts what was really used from the rolls you pick. Nothing is deducted unless every line fits.'
      }
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            {confirmPrint ? 'Confirm print and deduct' : 'Confirm and deduct'}
          </Button>
        </>
      }
    >
      <div role="group" aria-label="What happened" className="flex flex-wrap gap-2">
        {(
          [
            ['consumption', 'Used in a print'],
            ['loss', 'Lost: failed print or waste'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={type === value}
            onClick={() => setType(value)}
            className={cn(
              'h-11 rounded-full px-5 font-semibold',
              type === value ? 'bg-ink text-white' : 'bg-bench hover:bg-rule-soft',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <ol className="flex flex-col gap-4">
        {details.map(({ line, lotId, item, lot, cost, tooMuch }, index) => (
          <li
            key={line.id}
            className="flex flex-col gap-3 rounded-[var(--radius-tile)] bg-bench p-4"
          >
            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_140px_auto] md:items-end">
              <SelectField
                label={`Item ${index + 1}`}
                value={line.itemId}
                onChange={(e) =>
                  update(line.id, { itemId: e.target.value, lotId: firstLot(e.target.value) })
                }
              >
                <option value="">Choose…</option>
                {usable.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Roll or lot"
                value={lotId}
                disabled={!item}
                onChange={(e) => update(line.id, { lotId: e.target.value })}
              >
                <option value="">Choose…</option>
                {usableLots(item).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label} · {item ? showQuantity(l.remaining, item) : ''} left
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Quantity"
                inputMode="decimal"
                mono
                suffix={item ? unitLabel(item) : ''}
                value={line.quantity}
                onChange={(e) => update(line.id, { quantity: e.target.value })}
                error={
                  tooMuch && lot && item
                    ? `Only ${showQuantity(lot.remaining, item)} left`
                    : undefined
                }
              />
              <button
                type="button"
                aria-label={`Remove line ${index + 1}`}
                disabled={lines.length === 1}
                onClick={() => setLines((all) => all.filter((l) => l.id !== line.id))}
                className="grid size-12 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-40"
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
            {lot && item && (
              <p className="figure text-[13px] text-ink-muted">
                {lot.label}: {showQuantity(lot.remaining, item)} left
                {canSeeFinance && lot.unitCost && ` · ${showMoney(cost)} at the roll's own cost`}
                {canSeeFinance && !lot.unitCost && ' · cost unknown'}
              </p>
            )}
            {tooMuch && (
              <p className="text-[13px] text-ink">
                Split it: deduct what this roll has, then add a line for the rest from another roll.
              </p>
            )}
          </li>
        ))}
      </ol>
      <Button
        variant="soft"
        size="sm"
        icon={<Plus size={16} aria-hidden="true" />}
        onClick={() =>
          setLines((all) => [
            ...all,
            { id: Math.max(...all.map((l) => l.id)) + 1, itemId: '', lotId: '', quantity: '' },
          ])
        }
        className="self-start"
      >
        Add another roll or material
      </Button>
      <TextField
        label="Reason or note"
        placeholder={type === 'loss' ? 'e.g. spaghetti at layer 40' : 'e.g. keychains for João'}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {overDrawn && !overDrawn.tooMuch && (
        <Notice tone="attention" title="Same roll on several lines">
          Together these lines take more than {overDrawn.lot?.label} holds.
        </Notice>
      )}
      {error && (
        <Notice tone="attention" title="Nothing was deducted">
          {error}
        </Notice>
      )}
    </Modal>
  );
}
