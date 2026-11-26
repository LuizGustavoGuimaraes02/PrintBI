import { suggestedOrder, type OrderCardView } from '@printbi/shared';
import { Link } from 'react-router';
import { Badge, cn } from '../../design-system';
import { deadlineText, PAYMENT_LABEL, PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL } from './labels';

/** The same orders as a table, late cards first, then the nearest deadlines. */
export function OrderList({
  cards,
  today,
  onOpen,
}: {
  cards: OrderCardView[];
  today: string;
  onOpen: (id: string) => void;
}) {
  const rows = [...cards].sort((a, b) => suggestedOrder(a, b, today));
  const head = 'border-b border-rule py-2 pr-3 font-medium';
  const cell = 'border-b border-rule-soft py-2.5 pr-3';
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[880px] border-collapse text-[15px]">
        <thead>
          <tr className="label-mono text-left text-ink-muted">
            <th className={head}>Order</th>
            <th className={head}>Type</th>
            <th className={head}>For</th>
            <th className={cn(head, 'text-right')}>Qty</th>
            <th className={head}>Deadline</th>
            <th className={head}>Priority</th>
            <th className={head}>Printer</th>
            <th className={head}>Status</th>
            <th className={cn(head, 'pr-0 text-right')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((card) => (
            <tr key={card.id} className="hover:bg-bench">
              <td className={cell}>
                <button
                  type="button"
                  onClick={() => onOpen(card.id)}
                  className="text-left font-semibold hover:text-teal"
                >
                  {card.title}
                </button>
                {(card.blocked || card.stale) && (
                  <span className="block text-[12px] font-semibold text-hot-ink">
                    {card.blocked ? 'Blocked' : `${card.stale!.days} days in this column`}
                  </span>
                )}
              </td>
              <td className={cn(cell, 'text-[14px]')}>{TYPE_LABEL[card.type]}</td>
              <td className={cn(cell, 'text-[14px]')}>{card.recipient.name || '—'}</td>
              <td className={cn(cell, 'figure text-right')}>{card.quantity}</td>
              <td
                className={cn(
                  cell,
                  'figure text-[13px]',
                  card.overdue && 'font-semibold text-hot-ink',
                )}
              >
                {deadlineText(card, today)}
              </td>
              <td className={cn(cell, 'text-[14px]')}>{PRIORITY_LABEL[card.priority]}</td>
              <td className={cn(cell, 'text-[14px]')}>{card.printer?.name ?? 'Unassigned'}</td>
              <td className={cell}>
                <span className="flex flex-wrap gap-1">
                  <Badge tone={card.status === 'completed' ? 'teal' : 'neutral'}>
                    {STATUS_LABEL[card.status]}
                  </Badge>
                  {card.type === 'sale' && card.paymentStatus !== 'unpaid' && (
                    <Badge tone={card.paymentStatus === 'paid' ? 'teal' : 'neutral'}>
                      {PAYMENT_LABEL[card.paymentStatus]}
                    </Badge>
                  )}
                </span>
              </td>
              <td className={cn(cell, 'pr-0 text-right whitespace-nowrap')}>
                <button
                  type="button"
                  onClick={() => onOpen(card.id)}
                  className="h-8 rounded-full px-3 text-[13px] font-semibold hover:bg-teal-soft hover:text-teal-ink"
                >
                  View
                </button>
                <Link
                  to={`/orders/${card.id}/edit`}
                  className="inline-flex h-8 items-center rounded-full px-3 text-[13px] font-semibold text-ink-muted hover:bg-bench hover:text-ink"
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
