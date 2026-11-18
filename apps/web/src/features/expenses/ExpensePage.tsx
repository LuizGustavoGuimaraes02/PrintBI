import { formatMoney, paymentInputSchema, type ExpenseView } from '@printbi/shared';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  FilamentBar,
  Modal,
  Notice,
  PageLoader,
  Panel,
  SelectField,
  TextField,
  useToast,
} from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { useIdempotencyKey } from '../../lib/useIdempotencyKey';
import { useCan } from '../auth/account';
import { NoFinanceAccess, STATUS_BADGE } from './ExpensesPage';
import { useExpense, useRefreshExpenses } from './queries';

const dateFormat = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeZone: 'UTC' });
const METHOD: Record<string, string> = {
  cash: 'Cash',
  credit: 'Credit card',
  debit: 'Debit card',
  transfer: 'Transfer',
  other: 'Other',
};

export function ExpensePage() {
  const { expenseId = '' } = useParams();
  const canView = useCan('finance:view');
  const { data: expense, isPending } = useExpense(expenseId);
  if (!canView) return <NoFinanceAccess />;
  if (isPending) return <PageLoader label="Loading expense" />;
  if (!expense) {
    return (
      <EmptyState
        title="Expense not found"
        action={
          <Link to="/expenses" className="font-semibold text-teal">
            Back to expenses
          </Link>
        }
      >
        It may belong to another business.
      </EmptyState>
    );
  }
  return <ExpenseDetail expense={expense} />;
}

function ExpenseDetail({ expense }: { expense: ExpenseView }) {
  const toast = useToast();
  const refresh = useRefreshExpenses();
  const canManage = useCan('finance:manage');
  const canArchive = useCan('records:archive');
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const money = (amount: number) => formatMoney({ amount, currency: expense.amount.currency });
  const open = expense.status !== 'cancelled';

  const removePayment = async (paymentId: string) => {
    try {
      await api.delete(`/expenses/${expense.id}/payments/${paymentId}`);
      await refresh();
      toast.success('Payment removed');
    } catch (e) {
      toast.error('Not removed', e instanceof ApiError ? e.message : undefined);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <>
      <Link
        to="/expenses"
        className="inline-flex items-center gap-2 self-start px-1 text-[15px] font-semibold text-teal hover:text-teal-strong"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Expenses
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div className="flex flex-col gap-1">
          <span className="label-mono text-ink-muted">
            {expense.category.name} · {dateFormat.format(new Date(expense.purchasedAt))}
          </span>
          <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.03em] md:text-[40px]">
            {expense.description}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_BADGE[expense.status].tone}>
              {STATUS_BADGE[expense.status].label}
            </Badge>
            {expense.vendor && <span className="text-[15px] text-ink-muted">{expense.vendor}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && open && expense.outstanding > 0 && (
            <Button onClick={() => setPaying(true)}>Record payment</Button>
          )}
          {canManage && canArchive && open && (
            <Button variant="ghost" onClick={() => setCancelling(true)}>
              Cancel expense
            </Button>
          )}
        </div>
      </header>

      {expense.cancelled && (
        <Notice title="Cancelled">
          {dateFormat.format(new Date(expense.cancelled.at))}: {expense.cancelled.reason}. It no
          longer counts in totals; its payments stay on record.
        </Notice>
      )}

      <Panel>
        <dl className="grid gap-x-8 sm:grid-cols-3">
          {[
            ['Amount', formatMoney(expense.amount)],
            ['Paid', money(expense.paid)],
            ['Still to pay', money(expense.outstanding)],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 border-t border-rule-soft py-3">
              <dt className="label-mono text-ink-muted">{label}</dt>
              <dd className="figure text-[24px] font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <FilamentBar
          value={expense.paid}
          max={expense.amount.amount}
          label="Paid so far"
          readout={`${money(expense.paid)} of ${formatMoney(expense.amount)}`}
        />
        {expense.dueDate && open && expense.outstanding > 0 && (
          <p className="text-[15px]">Due {dateFormat.format(new Date(expense.dueDate))}</p>
        )}
        {expense.inventory && (
          <p className="text-[15px]">
            Paid for stock:{' '}
            <Link to={`/inventory/${expense.inventory.itemId}`} className="font-semibold text-teal">
              {expense.inventory.itemName}
            </Link>
            . The roll keeps the cost it was bought at; editing this expense does not change past
            usage costs.
          </p>
        )}
        {expense.notes && <p className="text-[15px] text-ink-muted">{expense.notes}</p>}
      </Panel>

      <Panel title="Payments">
        {expense.payments.length === 0 ? (
          <p className="text-ink-muted">No payments recorded yet.</p>
        ) : (
          <ul className="flex flex-col">
            {expense.payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-soft py-3 first:border-t-0"
              >
                <span className="flex flex-col">
                  <span className="figure text-[17px] font-medium">{money(p.amount)}</span>
                  <span className="text-[13px] text-ink-muted">
                    {dateFormat.format(new Date(p.paidAt))} · {METHOD[p.method]}
                    {p.note && ` · ${p.note}`}
                  </span>
                </span>
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 size={16} aria-hidden="true" />}
                    onClick={() => setRemoving(p.id)}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {paying && <PaymentDialog expense={expense} onClose={() => setPaying(false)} />}
      {cancelling && <CancelDialog expense={expense} onClose={() => setCancelling(false)} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this payment?"
        description="Use this only for a payment recorded by mistake. The change is kept in the audit log."
        confirmLabel="Remove payment"
        tone="danger"
        onConfirm={() => removing && void removePayment(removing)}
      />
    </>
  );
}

function PaymentDialog({ expense, onClose }: { expense: ExpenseView; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshExpenses();
  const idempotency = useIdempotencyKey();
  const [amount, setAmount] = useState(String(expense.outstanding / 1_000_000));
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('credit');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const payload = { amount, paidAt, method, note: '' };
    const parsed = paymentInputSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the values');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/expenses/${expense.id}/payments`, payload, { headers: idempotency.headers });
      idempotency.renew();
      await refresh();
      toast.success(
        'Payment recorded',
        formatMoney({ amount: parsed.data.amount, currency: expense.amount.currency }),
      );
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.details?.[0]?.message ?? e.message)
          : 'Could not reach the server.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Record payment"
      description={`Still to pay: ${formatMoney({ amount: expense.outstanding, currency: expense.amount.currency })}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            Save payment
          </Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={`Amount (${expense.amount.currency})`}
          inputMode="decimal"
          mono
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TextField
          label="Paid on"
          type="date"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
        />
        <SelectField label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {Object.entries(METHOD).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>
      {error && (
        <Notice tone="attention" title="Not saved">
          {error}
        </Notice>
      )}
    </Modal>
  );
}

function CancelDialog({ expense, onClose }: { expense: ExpenseView; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshExpenses();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason.trim()) {
      setError('Explain why it is cancelled');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/expenses/${expense.id}/cancel`, { reason });
      await refresh();
      toast.success('Expense cancelled', expense.description);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Cancel this expense?"
      description="It stays on record with its payments but stops counting in totals. Refunds are not recorded automatically."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" loading={saving} onClick={() => void submit()}>
            Cancel expense
          </Button>
        </>
      }
    >
      <TextField
        label="Reason"
        required
        placeholder="e.g. entered twice"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && (
        <Notice tone="attention" title="Not cancelled">
          {error}
        </Notice>
      )}
    </Modal>
  );
}
