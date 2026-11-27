import {
  BLOCK_REASONS,
  BOARD_COLUMNS,
  formatMoney,
  PAYMENT_STATUSES,
  type BlockReason,
  type BoardColumn,
  type LabelView,
  type Money,
  type OrderMovementView,
  type OrderView,
  type PaymentStatus,
} from '@printbi/shared';
import { Copy, ExternalLink, PackageCheck, Pencil, Scale } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Badge,
  Button,
  cn,
  DeleteAction,
  Hint,
  Modal,
  NozzleLoader,
  Notice,
  SelectField,
  useToast,
} from '../../design-system';
import { showMoney, toField } from '../../lib/money';
import { showGrams, showQuantity } from '../../lib/quantity';
import { useCan } from '../auth/account';
import { ConsumeDialog } from '../inventory/ConsumeDialog';
import { ReverseDialog } from '../inventory/ItemDialogs';
import {
  BLOCK_LABEL,
  deadlineText,
  HISTORY_LABEL,
  HOLD_OPTION,
  PAYMENT_LABEL,
  PRIORITY_LABEL,
  showDay,
  showMinutes,
  showMoment,
  STALE_FLAG_HINT,
  STALE_HINT,
  STATUS_LABEL,
  TYPE_LABEL,
} from './labels';
import { useOrder, useOrderMovements, useRefreshOrders } from './queries';
import { useOrderActions } from './useOrderActions';

interface OrderModalProps {
  id: string;
  labels: Map<string, LabelView>;
  today: string;
  onClose: () => void;
}

/** Everything about one job, opened from its card, with the actions that change it. */
export function OrderModal({ id, labels, today, onClose }: OrderModalProps) {
  const { data: order, isError } = useOrder(id, today);
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={order?.title ?? (isError ? 'Order not found' : 'Loading the order')}
      description={
        order
          ? `${TYPE_LABEL[order.type]} · ${order.recipient.name || 'No recipient'} · ×${order.quantity}`
          : undefined
      }
      width="lg"
    >
      {order ? (
        <OrderDetails order={order} labels={labels} today={today} onClose={onClose} />
      ) : isError ? (
        <p className="text-ink-muted">It may have been deleted.</p>
      ) : (
        <NozzleLoader label="Loading the order" />
      )}
    </Modal>
  );
}

type Dialog =
  | { kind: 'usage'; confirmPrint: boolean }
  | { kind: 'correct'; movement: OrderMovementView }
  | null;

function OrderDetails({
  order,
  labels,
  today,
  onClose,
}: {
  order: OrderView;
  labels: Map<string, LabelView>;
  today: string;
  onClose: () => void;
}) {
  const actions = useOrderActions();
  const refresh = useRefreshOrders();
  const canSeeMoney = useCan('finance:view');
  const canPay = useCan('finance:manage');
  const canRegisterSale = canPay && canSeeMoney;
  const canArchive = useCan('records:archive');
  const { data: movements } = useOrderMovements(order.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const cancelled = order.status === 'cancelled';

  const run = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  };
  const moveTo = (status: BoardColumn | 'cancelled') =>
    void run(status, () => actions.move(order.id, { status }));
  const finished = order.status === 'completed' || cancelled;

  const chips = order.labelIds.flatMap((id) => (labels.get(id) ? [labels.get(id)!] : []));
  const estimate = order.estimatedCost;
  const recorded = order.costSummary;

  return (
    <>
      {order.pictureUrl && (
        <img
          src={order.pictureUrl}
          alt={`Picture of ${order.title}`}
          className="h-40 w-full rounded-[var(--radius-tile)] bg-bench object-contain"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={cancelled ? 'neutral' : order.status === 'completed' ? 'teal' : 'neutral'}>
          {STATUS_LABEL[order.status]}
        </Badge>
        {order.type === 'sale' && (
          <Badge tone={order.paymentStatus === 'paid' ? 'teal' : 'neutral'}>
            {PAYMENT_LABEL[order.paymentStatus]}
          </Badge>
        )}
        {order.priority !== 'normal' && (
          <Badge tone={order.priority === 'low' ? 'neutral' : 'hot'}>
            {PRIORITY_LABEL[order.priority]} priority
          </Badge>
        )}
        {order.hidden && <Badge>Off the board</Badge>}
      </div>

      {order.overdue && (
        <Notice tone="attention" title="Overdue">
          {deadlineText(order, today)}: it was due {showDay(order.dueDate!)}.
        </Notice>
      )}
      {order.blocked && !order.stale && (
        <Notice tone="attention" title={BLOCK_LABEL[order.blocked.reason]}>
          {order.blocked.note && `${order.blocked.note} · `}Since {showMoment(order.blocked.since)}
        </Notice>
      )}
      {order.status === 'completed' && order.usageCount === 0 && (
        <Notice
          title="Printed: confirm what it used"
          action={
            <Button
              size="sm"
              icon={<PackageCheck size={16} aria-hidden="true" />}
              hint="Deducts the picked rolls from stock with the file's grams. You check them before anything is deducted. It replaces Record usage: don't do both."
              onClick={() => setDialog({ kind: 'usage', confirmPrint: true })}
            >
              Confirm print
            </Button>
          }
        >
          Deducts the picked rolls from stock, with the grams from the print file.
        </Notice>
      )}
      <ReminderNotice order={order} busy={busy} run={run} />

      {/* Actions */}
      <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius-tile)] bg-bench p-3">
        {!cancelled && (
          <SelectField
            label="Move to"
            value={order.status}
            onChange={(e) => moveTo(e.target.value as BoardColumn)}
            className="w-56"
          >
            {BOARD_COLUMNS.map((c) => (
              <option key={c} value={c}>
                {STATUS_LABEL[c]}
              </option>
            ))}
          </SelectField>
        )}
        {!finished && (
          <SelectField
            label="Waiting for"
            value={order.blocked?.reason ?? ''}
            onChange={(e) =>
              void run('hold', () =>
                actions.hold(
                  order.id,
                  e.target.value
                    ? { reason: e.target.value as BlockReason, note: order.blocked?.note ?? '' }
                    : null,
                ),
              )
            }
            className="w-60"
          >
            <option value="">Nothing</option>
            {BLOCK_REASONS.map((r) => (
              <option key={r} value={r}>
                {HOLD_OPTION[r]}
              </option>
            ))}
          </SelectField>
        )}
        {order.type === 'sale' && order.sale && (
          <Hint text="This order's payment follows the receipts recorded on its sale.">
            <Link
              to={`/sales/${order.sale.id}`}
              className="inline-flex h-12 items-center rounded-full bg-surface px-5 text-[15px] font-bold text-teal hover:bg-teal-soft"
            >
              Sale <span className="figure ml-1.5">{order.sale.code}</span>
            </Link>
          </Hint>
        )}
        {canRegisterSale && order.type === 'sale' && !order.sale && !cancelled && (
          <Hint text="Opens a new sale filled from this order to review. Its receipts then decide this order's payment. Nothing is deducted from stock.">
            <Link
              to={`/sales/new?order=${order.id}`}
              className="inline-flex h-12 items-center rounded-full bg-surface px-5 text-[15px] font-bold text-teal hover:bg-teal-soft"
            >
              Register sale
            </Link>
          </Hint>
        )}
        {canPay && order.type === 'sale' && !order.sale && (
          <SelectField
            label="Payment"
            value={order.paymentStatus}
            onChange={(e) =>
              void run('pay', () => actions.setPayment(order.id, e.target.value as PaymentStatus))
            }
            className="w-40"
          >
            {PAYMENT_STATUSES.filter((p) => p !== 'not_required' || order.paymentStatus === p).map(
              (p) => (
                <option key={p} value={p}>
                  {PAYMENT_LABEL[p]}
                </option>
              ),
            )}
          </SelectField>
        )}
        <div className="flex flex-1 flex-wrap justify-end gap-2">
          <Button
            variant="soft"
            icon={<Scale size={16} aria-hidden="true" />}
            hint={
              order.usageCount > 0
                ? `Deducts more stock for this order. It already has ${order.usageCount} usage line(s): record only what is missing.`
                : 'Deducts what the print used from stock, by hand. On a Done card, Confirm print does the same with the picked rolls: use one or the other.'
            }
            onClick={() => setDialog({ kind: 'usage', confirmPrint: false })}
          >
            Record usage
          </Button>
          <Link
            to={`/orders/${order.id}/edit`}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-teal px-6 text-[15px] font-bold text-white hover:bg-teal-strong"
          >
            <Pencil size={16} aria-hidden="true" /> Edit
          </Link>
        </div>
      </div>

      {/* Details */}
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-3">
        <Detail label="Due">{order.dueDate ? showDay(order.dueDate) : 'No deadline'}</Detail>
        <Detail label="Printer">{order.printer?.name ?? 'None yet'}</Detail>
        <Detail label="Filament">
          {order.filaments.length
            ? order.filaments
                .map((f) => (f.grams ? `${f.name} · ${showGrams(f.grams)}` : f.name))
                .join(', ')
            : order.material || 'Not picked'}
        </Detail>
        <Detail label="Ordered">{showDay(order.orderDate)}</Detail>
        {order.completedAt && <Detail label="Done">{showMoment(order.completedAt)}</Detail>}
        {order.product && (
          <Detail label="Product">
            <Link to={`/products/${order.product.id}`} className="text-teal hover:underline">
              {order.product.name}
            </Link>
          </Detail>
        )}
        {order.estimatedMinutes !== null && (
          <Detail label="Print time (file)">{showMinutes(order.estimatedMinutes)}</Detail>
        )}
        {order.estimatedGrams !== null && (
          <Detail label="Filament (file)">{showGrams(order.estimatedGrams)}</Detail>
        )}
        {canSeeMoney && order.type === 'sale' && (
          <Detail label="Agreed price">{showMoney(order.agreedPrice)}</Detail>
        )}
        {order.quote && (
          <Detail label="From quote">
            <Link to={`/quotes/${order.quote.id}`} className="figure text-teal hover:underline">
              {order.quote.code}
            </Link>
          </Detail>
        )}
        {order.recipient.customerId && (
          <Detail label="Customer">
            <Link
              to={`/customers/${order.recipient.customerId}`}
              className="text-teal hover:underline"
            >
              {order.recipient.name}
            </Link>
          </Detail>
        )}
        {order.modelUrl && (
          <Detail label="3D model">
            <a
              href={order.modelUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-teal hover:underline"
            >
              Open link <ExternalLink size={13} aria-hidden="true" />
            </a>
          </Detail>
        )}
      </dl>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((l) => (
            <span
              key={l.id}
              className="inline-flex h-7 items-center rounded-full px-3 text-[13px] font-semibold text-ink"
              style={{ background: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      <Notes title="Description">{order.description}</Notes>
      <Notes title="Assembly and finishing">{order.finishingNotes}</Notes>
      <Notes title="Internal notes">{order.internalNotes}</Notes>

      {/* Usage */}
      <section className="flex flex-col gap-3">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-bold">What it used</h3>
          {canSeeMoney && (recorded || estimate) && (
            <p className="figure text-[13px] text-ink-muted">
              Recorded {moneyList(recorded?.materials)}
              {recorded && recorded.losses.length > 0 && ` + ${moneyList(recorded.losses)} lost`}
              {estimate && ` · estimated ${formatMoney(estimate)}`}
            </p>
          )}
        </header>
        {!movements ? (
          <NozzleLoader label="Loading usage" />
        ) : movements.length === 0 ? (
          <p className="text-[15px] text-ink-muted">
            Nothing recorded yet. Moving the card never deducts stock: record what the print really
            used when it is done.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule-soft">
            {movements.map((m) => (
              <li
                key={m.id}
                className={cn(
                  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[88px_minmax(0,1fr)_auto_auto_auto]',
                  m.reversed && 'text-ink-muted',
                )}
              >
                <span className="label-mono col-span-2 text-[11px] text-ink-muted sm:col-span-1">
                  {m.type === 'loss' ? 'Lost' : m.type === 'correction' ? 'Correction' : 'Used'}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn('font-semibold', m.reversed && 'line-through')}>
                    {m.itemName} · {m.lotLabel}
                  </span>
                  <span className="text-[12px] text-ink-muted">
                    {m.actorName} · {showMoment(m.createdAt)}
                    {m.reason && ` · ${m.reason}`}
                  </span>
                </span>
                <span className="figure text-[14px]">
                  {m.delta < 0 ? '−' : '+'}
                  {showQuantity(Math.abs(m.delta), m)}
                </span>
                {canSeeMoney && (
                  <span className="figure text-right text-[13px] text-ink-muted sm:w-20">
                    {m.unitCost &&
                      formatMoney({
                        amount: Math.round((Math.abs(m.delta) * m.unitCost.amount) / 1_000_000),
                        currency: m.unitCost.currency,
                      })}
                  </span>
                )}
                {!m.reversed && !m.reversalOf ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    hint="Gives this amount back to the roll with a correction line. The original line stays in the history."
                    onClick={() => setDialog({ kind: 'correct', movement: m })}
                  >
                    Correct
                  </Button>
                ) : (
                  <span className="label-mono text-[11px] text-ink-muted sm:w-[76px]">
                    {m.reversed ? 'corrected' : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {canSeeMoney && recorded && recorded.unpricedLines > 0 && (
          <p className="text-[13px] text-ink-muted">
            {recorded.unpricedLines} line(s) came from stock without a price and add no cost.
          </p>
        )}
      </section>

      {/* History */}
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-bold">History</h3>
        <ol className="flex flex-col gap-1.5">
          {[...order.history].reverse().map((h, i) => (
            <li key={`${h.at}-${i}`} className="flex flex-wrap gap-x-3 text-[14px]">
              <span className="figure w-48 text-[13px] whitespace-nowrap text-ink-muted">
                {showMoment(h.at)}
              </span>
              <span className="font-semibold">{HISTORY_LABEL[h.status]}</span>
              <span className="text-ink-muted">
                {h.by}
                {h.note && ` · ${h.note}`}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {canArchive && (
        <footer className="flex flex-wrap justify-end gap-2 border-t border-rule-soft pt-4">
          {cancelled ? (
            <Button
              variant="soft"
              loading={busy === 'todo'}
              hint="Puts it back on the board, in To do."
              onClick={() => moveTo('todo')}
            >
              Reopen order
            </Button>
          ) : (
            <Button
              variant="ghost"
              loading={busy === 'cancelled'}
              hint="Takes it off the board and keeps its history. Stock already deducted is not given back; use Correct for that."
              onClick={() => moveTo('cancelled')}
            >
              Cancel order
            </Button>
          )}
          <DeleteAction
            title={`Delete ${order.title}?`}
            description={
              order.usageCount > 0
                ? 'It recorded stock use, so it can only be cancelled: its history stays.'
                : 'For an order entered by mistake. It disappears from the board and the lists. Cancelling keeps it in the history instead.'
            }
            confirmLabel="Delete order"
            hint={
              order.usageCount > 0
                ? 'It recorded stock use, so it can only be cancelled.'
                : 'Deletes it for good, for an order entered by mistake. Cancel keeps the history instead.'
            }
            onDelete={async () => {
              await actions.remove(order);
              onClose();
            }}
          />
        </footer>
      )}

      {dialog?.kind === 'usage' && (
        <ConsumeDialog
          order={{ id: order.id, title: order.title }}
          confirmPrint={dialog.confirmPrint}
          prefill={order.filaments.map((f) => ({ itemId: f.itemId, quantity: toField(f.grams) }))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'correct' && (
        <ReverseDialog
          item={dialog.movement}
          movement={dialog.movement}
          onDone={refresh}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

const moneyList = (list?: Money[]) =>
  list && list.length
    ? list.map((m) => formatMoney(m)).join(' + ')
    : formatMoney({ amount: 0, currency: 'CAD' });

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="label-mono text-[11px] text-ink-muted">{label}</dt>
      <dd className="text-[15px] break-words">{children}</dd>
    </div>
  );
}

function Notes({ title, children }: { title: string; children: string }) {
  if (!children) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="label-mono text-[11px] text-ink-muted">{title}</h3>
      <p className="text-[15px] whitespace-pre-line">{children}</p>
    </div>
  );
}

/** A card past its column's threshold: follow up, mark contacted, or snooze. */
function ReminderNotice({
  order,
  busy,
  run,
}: {
  order: OrderView;
  busy: string | null;
  run: (label: string, work: () => Promise<unknown>) => Promise<void>;
}) {
  const actions = useOrderActions();
  const toast = useToast();
  const firstName = order.recipient.name.split(' ')[0] ?? '';
  const message = `Hi ${firstName}! Have you had a chance to look at the quote? Let me know if you have any questions or want to discuss changes.`;

  if (order.snoozedUntil && new Date(order.snoozedUntil) > new Date()) {
    return (
      <Notice
        title="Reminder snoozed"
        action={
          <Button
            variant="ghost"
            size="sm"
            loading={busy === 'unsnooze'}
            onClick={() =>
              void run('unsnooze', () => actions.remind(order.id, { action: 'unsnooze' }))
            }
          >
            Turn back on
          </Button>
        }
      >
        Until {showMoment(order.snoozedUntil)}.
      </Notice>
    );
  }
  if (!order.stale) return null;
  const askCustomer =
    order.blocked?.reason === 'quote_approval' || order.blocked?.reason === 'waiting_customer';
  return (
    <Notice
      tone="attention"
      title={
        order.blocked
          ? STALE_FLAG_HINT[order.blocked.reason]
          : (STALE_HINT[order.status] ?? 'Needs a look')
      }
    >
      <div className="flex flex-col gap-2">
        <span>
          {order.stale.days} days{' '}
          {order.blocked
            ? BLOCK_LABEL[order.blocked.reason].toLowerCase()
            : `in ${STATUS_LABEL[order.status]}`}{' '}
          (reminder after {order.stale.threshold}).
          {order.lastContactAt && ` Last contact ${showMoment(order.lastContactAt)}.`}
        </span>
        {askCustomer && order.recipient.kind !== 'myself' && (
          <div className="flex flex-wrap items-center gap-2 rounded-[12px] bg-bench px-3 py-2 text-[14px]">
            <span className="min-w-0 flex-1 italic">{message}</span>
            <Button
              variant="ghost"
              size="sm"
              hint="Copies the message to paste in WhatsApp or email. Nothing is sent from here."
              icon={<Copy size={14} aria-hidden="true" />}
              onClick={() =>
                void navigator.clipboard
                  .writeText(message)
                  .then(() => toast.success('Message copied', 'Nothing was sent.'))
              }
            >
              Copy
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            hint="You followed up with them: the reminder starts counting again from today."
            loading={busy === 'contacted'}
            onClick={() =>
              void run('contacted', () => actions.remind(order.id, { action: 'contacted' }))
            }
          >
            Contacted
          </Button>
          {[1, 3, 7].map((days) => (
            <Button
              key={days}
              variant="soft"
              size="sm"
              hint={`Hides this reminder for ${days === 1 ? 'a day' : `${days} days`}. Nothing else changes.`}
              loading={busy === `snooze${days}`}
              onClick={() =>
                void run(`snooze${days}`, () =>
                  actions.remind(order.id, { action: 'snooze', days }),
                )
              }
            >
              Snooze {days} {days === 1 ? 'day' : 'days'}
            </Button>
          ))}
        </div>
      </div>
    </Notice>
  );
}
