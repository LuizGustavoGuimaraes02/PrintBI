import { formatMoney, type Currency, type UnrecordedLotView } from '@printbi/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Modal, Notice, SelectField, TextField, useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { localToday } from '../../lib/period';
import { useCan } from '../auth/account';
import { useCategories } from '../settings/queries';
import { defaultExpenseCategory } from './forms';
import { useRefreshInventory } from './queries';

const dateFormat = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeZone: 'UTC' });

export interface PurchaseGroup {
  key: string;
  purchasedAt: string | null;
  store: string;
  lots: UnrecordedLotView[];
}

/** Same grouping as the API: one expense per day, store and currency. */
export function groupPurchases(lots: UnrecordedLotView[]): PurchaseGroup[] {
  const groups = new Map<string, PurchaseGroup>();
  for (const lot of lots) {
    const day = lot.purchasedAt?.slice(0, 10) ?? 'undated';
    const key = `${day}|${lot.store.trim().toLowerCase()}|${lot.totalCost.currency}`;
    const group = groups.get(key) ?? {
      key,
      purchasedAt: lot.purchasedAt,
      store: lot.store,
      lots: [],
    };
    group.lots.push(lot);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Totals per currency, e.g. "CAD 60.00 + BRL 80,00". Amounts are integer micro-units. */
const total = (lots: UnrecordedLotView[]) => {
  const byCurrency = new Map<Currency, number>();
  for (const { totalCost } of lots) {
    byCurrency.set(
      totalCost.currency,
      (byCurrency.get(totalCost.currency) ?? 0) + totalCost.amount,
    );
  }
  return [...byCurrency].map(([currency, amount]) => formatMoney({ amount, currency })).join(' + ');
};

const useUnrecordedLots = (enabled: boolean) =>
  useQuery({
    queryKey: ['inventory', 'unrecorded'],
    queryFn: () => api.get<UnrecordedLotView[]>('/inventory/unrecorded-lots'),
    enabled,
  });

/**
 * Rolls saved with a price but no expense (the switch was off, or a member without financial
 * access registered them). Shown only to members who can record expenses.
 */
export function UnrecordedExpensesNotice() {
  const canManage = useCan('finance:manage');
  const { data: lots } = useUnrecordedLots(canManage);
  const [open, setOpen] = useState(false);
  if (!canManage || !lots || lots.length === 0) return null;
  const rolls = lots.length === 1 ? '1 roll or lot has' : `${lots.length} rolls or lots have`;
  return (
    <>
      <Notice
        tone="attention"
        title="Missing from Costs & Expenses"
        action={<Button onClick={() => setOpen(true)}>Review and record</Button>}
      >
        {rolls} a price but no expense yet ({total(lots)}).
      </Notice>
      {open && <RecordExpensesDialog lots={lots} onClose={() => setOpen(false)} />}
    </>
  );
}

function RecordExpensesDialog({
  lots,
  onClose,
}: {
  lots: UnrecordedLotView[];
  onClose: () => void;
}) {
  const toast = useToast();
  const refresh = useRefreshInventory();
  const { data: categories } = useCategories();
  const groups = groupPurchases(lots);
  const [selected, setSelected] = useState(() => new Set(groups.map((g) => g.key)));
  const [categoryId, setCategoryId] = useState('');
  const [paid, setPaid] = useState(true);
  const [paidAt, setPaidAt] = useState(localToday);
  const [method, setMethod] = useState('credit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = categories?.filter((c) => !c.archived) ?? [];
  const category = categoryId || (categories ? defaultExpenseCategory(categories, 'filament') : '');
  const chosen = groups.filter((g) => selected.has(g.key));
  const chosenLots = chosen.flatMap((g) => g.lots);

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await api.post<{ expenses: number; lots: number }>(
        '/inventory/unrecorded-lots/expenses',
        {
          lots: chosenLots.map((l) => ({ itemId: l.itemId, lotId: l.lotId })),
          categoryId: category,
          paidAt: paid ? paidAt : null,
          method,
        },
      );
      await refresh();
      toast.success(
        result.expenses === 1 ? '1 expense recorded' : `${result.expenses} expenses recorded`,
        `${result.lots} ${result.lots === 1 ? 'roll' : 'rolls'} now in Costs & Expenses`,
      );
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server.');
      if (e instanceof ApiError && e.status === 409) await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Record in Costs & Expenses"
      description="Rolls bought on the same day at the same store become one expense."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={chosen.length === 0 || !category}
            onClick={() => void save()}
          >
            {chosen.length === 1 ? 'Record 1 expense' : `Record ${chosen.length} expenses`}
          </Button>
        </>
      }
    >
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Purchases</legend>
        <ul className="flex flex-col divide-y divide-rule-soft rounded-[var(--radius-tile)] border border-rule-soft">
          {groups.map((group) => (
            <li key={group.key}>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-bench">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-teal"
                  checked={selected.has(group.key)}
                  onChange={() => toggle(group.key)}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold">
                    {[
                      group.purchasedAt
                        ? dateFormat.format(new Date(group.purchasedAt))
                        : 'No date',
                      group.store || 'No store',
                    ].join(' · ')}
                  </span>
                  <span className="truncate text-[13px] text-ink-muted">
                    {group.lots.map((l) => `${l.itemName} (${l.lotLabel})`).join(', ')}
                  </span>
                </span>
                <span className="figure shrink-0 text-right text-[14px]">
                  {total(group.lots)}
                  <span className="block text-[12px] text-ink-muted">
                    {group.lots.length} {group.lots.length === 1 ? 'roll' : 'rolls'}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Expense category"
          value={category}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Payment"
          value={paid ? 'paid' : 'pending'}
          onChange={(e) => setPaid(e.target.value === 'paid')}
        >
          <option value="paid">Already paid</option>
          <option value="pending">Still to pay</option>
        </SelectField>
        {paid && (
          <>
            <TextField
              label="Paid on"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
            <SelectField label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="credit">Credit card</option>
              <option value="debit">Debit card</option>
              <option value="cash">Cash</option>
              <option value="transfer">Transfer</option>
              <option value="other">Other</option>
            </SelectField>
          </>
        )}
      </div>
      {chosenLots.length > 0 && (
        <p className="figure text-sm text-ink-muted">
          Total {total(chosenLots)} across {chosenLots.length}{' '}
          {chosenLots.length === 1 ? 'roll' : 'rolls'}.
        </p>
      )}
      {error && (
        <Notice tone="attention" title="Not recorded">
          {error}
        </Notice>
      )}
    </Modal>
  );
}
