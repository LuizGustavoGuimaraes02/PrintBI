import type { LabelView, OrderCardView } from '@printbi/shared';
import { GripVertical, PackageCheck } from 'lucide-react';
import type { CSSProperties, HTMLAttributes, Ref } from 'react';
import { cn, Hint, SpoolGauge } from '../../design-system';
import { filamentStops } from '../../design-system/ColorSwatch';
import { BLOCK_LABEL, deadlineText, PRIORITY_LABEL, STALE_FLAG_HINT, STALE_HINT } from './labels';

interface OrderCardProps {
  card: OrderCardView;
  labels: Map<string, LabelView>;
  today: string;
  onOpen?: (id: string) => void;
  /** Done and nothing deducted yet: records the usage from the rolls picked for the job. */
  onConfirmPrint?: (card: OrderCardView) => void;
  /** Drag wiring from the board; absent in the drag preview. */
  rootRef?: Ref<HTMLElement>;
  style?: CSSProperties;
  rootProps?: HTMLAttributes<HTMLElement>;
  handleRef?: Ref<HTMLButtonElement>;
  handleProps?: HTMLAttributes<HTMLButtonElement>;
  dragging?: boolean;
  overlay?: boolean;
}

/** The one thing on a card that needs attention, if any: waiting, late, stale or unpaid. */
export function cardFlag(card: OrderCardView, today: string): string | null {
  if (card.blocked) {
    return card.stale
      ? `${STALE_FLAG_HINT[card.blocked.reason]} · ${card.stale.days} days`
      : BLOCK_LABEL[card.blocked.reason];
  }
  if (card.overdue) return deadlineText(card, today);
  if (card.stale) return `${STALE_HINT[card.status] ?? 'Needs a look'} · ${card.stale.days} days`;
  if (
    card.type === 'sale' &&
    (card.status === 'ready' || card.status === 'completed') &&
    (card.paymentStatus === 'unpaid' || card.paymentStatus === 'partial')
  ) {
    return card.paymentStatus === 'partial' ? 'Partly paid' : 'Not paid yet';
  }
  return null;
}

/**
 * One job on the board: title, who and when, the rolls picked for it, and one line only when
 * something needs attention. The whole card drags with a mouse or a long press; keyboard
 * users lift it with the grip button (space), move it with the arrows and drop it with space.
 */
export function OrderCard({
  card,
  labels,
  today,
  onOpen,
  onConfirmPrint,
  rootRef,
  style,
  rootProps,
  handleRef,
  handleProps,
  dragging,
  overlay,
}: OrderCardProps) {
  const flag = cardFlag(card, today);
  const urgent = card.priority === 'urgent' || card.priority === 'high';
  const chips = card.labelIds.flatMap((id) => (labels.get(id) ? [labels.get(id)!] : []));
  const confirm =
    card.status === 'completed' && card.usageCount === 0 && onConfirmPrint && !overlay;
  const when = card.dueDate && !card.overdue ? deadlineText(card, today).replace(/^D/, 'd') : '';
  return (
    <article
      ref={rootRef}
      style={style}
      {...rootProps}
      aria-label={card.title}
      className={cn(
        'group relative flex touch-manipulation flex-col gap-1 rounded-[var(--radius-tile)] border border-rule-soft bg-surface px-3.5 py-3 text-left',
        dragging && 'opacity-40',
        overlay ? 'cursor-grabbing shadow-[var(--shadow-pop)]' : 'shadow-sm',
      )}
    >
      {card.pictureUrl && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => onOpen?.(card.id)}
          className="-mx-1 -mt-0.5 mb-1.5 block h-24 overflow-hidden rounded-[12px] bg-bench"
        >
          <img
            src={card.pictureUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className="size-full object-contain"
          />
        </button>
      )}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onOpen?.(card.id)}
          className="min-w-0 flex-1 text-left text-[15px] leading-snug font-bold hover:text-teal focus-visible:text-teal"
        >
          {card.title}
          {card.quantity > 1 && (
            <span className="figure ml-1.5 text-[13px] font-medium text-ink-muted">
              ×{card.quantity}
            </span>
          )}
        </button>
        {card.filaments.length > 0 && (
          <span
            className="flex shrink-0 pt-0.5"
            title={card.filaments.map((f) => f.name).join(', ')}
          >
            {card.filaments.slice(0, 3).map((f, i) => (
              <span key={f.itemId} className={cn(i > 0 && '-ml-1.5')}>
                <SpoolGauge
                  remaining={1}
                  capacity={1}
                  color={filamentStops(f.filament)}
                  size={18}
                  spinning={false}
                  label={f.name}
                />
              </span>
            ))}
          </span>
        )}
      </div>

      <span className="truncate text-[13px] text-ink-muted">
        {card.recipient.name || 'No one yet'}
        {when && ` · ${when}`}
        {urgent && (
          <span className="font-semibold text-hot-ink"> · {PRIORITY_LABEL[card.priority]}</span>
        )}
      </span>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {chips.map((label) => (
            <span
              key={label.id}
              className="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold text-ink"
              style={{ background: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {flag && (
        <div className="flex flex-col pt-0.5">
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-hot-ink">
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-hot" />
            {flag}
          </p>
          {card.blocked?.note && (
            <p className="truncate pl-3 text-[12px] text-ink-muted">{card.blocked.note}</p>
          )}
        </div>
      )}

      {confirm && (
        <Hint
          text={
            card.filaments.length
              ? `Deducts ${card.filaments.map((f) => f.name).join(' and ')} from stock, with the grams from the print file. You check them first. It replaces Record usage: don't do both.`
              : "Deducts what this print used from stock. You pick the rolls and grams first. It replaces Record usage: don't do both."
          }
        >
          <button
            type="button"
            onClick={() => onConfirmPrint(card)}
            className="mt-1.5 inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-teal-soft text-[13px] font-bold text-teal-ink hover:bg-teal hover:text-white"
          >
            <PackageCheck size={16} aria-hidden="true" />
            Confirm print
          </button>
        </Hint>
      )}

      {!overlay && (
        <Hint text="Drag to move the card. With the keyboard: space, the arrow keys, then space again.">
          <button
            ref={handleRef}
            type="button"
            data-drag-handle=""
            aria-label={`Move ${card.title}`}
            aria-roledescription="draggable card"
            className="absolute -top-2 -left-2 grid size-7 cursor-grab place-items-center rounded-full border border-rule bg-surface text-steel opacity-0 shadow-sm group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:hidden"
            {...handleProps}
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
        </Hint>
      )}
    </article>
  );
}
