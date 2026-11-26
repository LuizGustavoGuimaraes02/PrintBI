import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardSensorOptions,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BOARD_COLUMNS,
  type BoardColumn,
  type LabelView,
  type OrderCardView,
} from '@printbi/shared';
import { Plus } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { cn } from '../../design-system';
import { STATUS_LABEL } from './labels';
import { OrderCard } from './OrderCard';

type Columns = Record<BoardColumn, string[]>;

/** Lifts a card from the keyboard only from its grip button, so Enter on "View" still opens it. */
class HandleKeyboardSensor extends KeyboardSensor {
  static override activators = [
    {
      eventName: 'onKeyDown' as const,
      handler: (
        event: KeyboardEvent,
        options: KeyboardSensorOptions,
        context: { active: { id: UniqueIdentifier } },
      ) =>
        (event.target as HTMLElement).dataset.dragHandle !== undefined &&
        KeyboardSensor.activators[0]!.handler(event, options, context as never),
    },
  ];
}

const group = (cards: OrderCardView[]): Columns => {
  const columns = Object.fromEntries(BOARD_COLUMNS.map((c) => [c, [] as string[]])) as Columns;
  for (const card of cards) {
    if (card.status !== 'cancelled') columns[card.status].push(card.id);
  }
  return columns;
};

interface OrderBoardProps {
  cards: OrderCardView[];
  labels: Map<string, LabelView>;
  today: string;
  onOpen: (id: string) => void;
  /** Persists a move; `afterId` is the card above it in the new spot (null for the top). */
  onMove: (card: OrderCardView, status: BoardColumn, afterId: string | null) => Promise<void>;
  /** Opens the new order window for a column. */
  onAdd?: (column: BoardColumn) => void;
  /** "Confirm print" on a Done card that has not deducted anything yet. */
  onConfirmPrint?: (card: OrderCardView) => void;
}

/**
 * The Kanban board. Cards move between columns and inside them by mouse, touch or keyboard;
 * dropping saves the column and the manual order. Nothing else happens on a move.
 */
export function OrderBoard({
  cards,
  labels,
  today,
  onOpen,
  onMove,
  onAdd,
  onConfirmPrint,
}: OrderBoardProps) {
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const [local, setLocal] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const columns = local ?? group(cards);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(HandleKeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const find = (id: UniqueIdentifier, from: Columns = columns): BoardColumn | undefined =>
    (BOARD_COLUMNS as readonly string[]).includes(String(id))
      ? (id as BoardColumn)
      : BOARD_COLUMNS.find((c) => from[c].includes(String(id)));

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setLocal(group(cards));
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setLocal((prev) => {
      if (!prev) return prev;
      const from = find(active.id, prev);
      const to = find(over.id, prev);
      if (!from || !to || from === to) return prev;
      const id = String(active.id);
      const index = prev[to].indexOf(String(over.id));
      const at = index >= 0 ? index : prev[to].length;
      return {
        ...prev,
        [from]: prev[from].filter((x) => x !== id),
        [to]: [...prev[to].slice(0, at), id, ...prev[to].slice(at)],
      };
    });
  };

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    const card = byId.get(String(active.id));
    const current = local;
    if (!over || !card || !current) {
      setLocal(null);
      return;
    }
    const to = find(over.id, current);
    if (!to) {
      setLocal(null);
      return;
    }
    let list = current[to];
    const from = list.indexOf(card.id);
    const target = list.indexOf(String(over.id));
    if (target >= 0 && from !== target) list = arrayMove(list, from, target);
    const index = list.indexOf(card.id);
    const before = group(cards)[card.status === 'cancelled' ? 'todo' : card.status];
    if (to === card.status && before.indexOf(card.id) === index) {
      setLocal(null);
      return;
    }
    setLocal({ ...current, [to]: list });
    try {
      await onMove(card, to, list[index - 1] ?? null);
    } finally {
      setLocal(null);
    }
  };

  const title = (id: UniqueIdentifier) => byId.get(String(id))?.title ?? 'Card';
  const where = (id: UniqueIdentifier | undefined) => {
    const column = id === undefined ? undefined : find(id);
    return column ? STATUS_LABEL[column] : 'nowhere';
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${title(active.id)}. Arrow keys move it, space drops it, escape cancels.`,
    onDragOver: ({ active, over }) => `${title(active.id)} is over ${where(over?.id)}.`,
    onDragEnd: ({ active, over }) => `${title(active.id)} dropped in ${where(over?.id)}.`,
    onDragCancel: ({ active }) => `Moving ${title(active.id)} was cancelled.`,
  };

  const active = activeId ? byId.get(activeId) : undefined;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={(e) => void onDragEnd(e)}
      onDragCancel={() => {
        setActiveId(null);
        setLocal(null);
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To move a card, press space on its grip button, use the arrow keys, then press space again.',
        },
      }}
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-1 md:px-1">
        <div className="flex min-w-full gap-3">
          {BOARD_COLUMNS.map((column) => (
            <BoardColumnView
              key={column}
              column={column}
              ids={columns[column]}
              byId={byId}
              labels={labels}
              today={today}
              onOpen={onOpen}
              activeId={activeId}
              onAdd={onAdd ? () => onAdd(column) : undefined}
              onConfirmPrint={onConfirmPrint}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {active && <OrderCard card={active} labels={labels} today={today} overlay />}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumnView({
  column,
  ids,
  byId,
  labels,
  today,
  onOpen,
  activeId,
  onAdd,
  onConfirmPrint,
}: {
  column: BoardColumn;
  ids: string[];
  byId: Map<string, OrderCardView>;
  labels: Map<string, LabelView>;
  today: string;
  onOpen: (id: string) => void;
  activeId: string | null;
  onAdd?: () => void;
  onConfirmPrint?: (card: OrderCardView) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  const cards = ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
  const flagged = cards.filter((c) => c.overdue || c.stale).length;
  return (
    <section
      aria-label={STATUS_LABEL[column]}
      className={cn(
        'flex min-w-[240px] flex-1 basis-0 flex-col gap-2 rounded-[var(--radius-card)] bg-bench p-2.5',
        isOver && 'ring-2 ring-teal/40',
      )}
    >
      <header className="flex items-baseline justify-between gap-2 px-1.5 pt-1">
        <h2 className="text-[14px] font-bold">{STATUS_LABEL[column]}</h2>
        <span className="figure shrink-0 text-[12px] whitespace-nowrap text-ink-muted">
          {cards.length}
          {flagged > 0 && <span className="text-hot-ink"> · {flagged} to check</span>}
        </span>
      </header>
      <SortableContext id={column} items={ids} strategy={verticalListSortingStrategy}>
        <ol ref={setNodeRef} className="flex min-h-24 flex-col gap-2">
          {cards.map((card) => (
            <li key={card.id}>
              <SortableCard
                card={card}
                labels={labels}
                today={today}
                onOpen={onOpen}
                onConfirmPrint={onConfirmPrint}
                dragging={card.id === activeId}
              />
            </li>
          ))}
          {cards.length === 0 && (
            <li className="grid min-h-24 place-items-center rounded-[var(--radius-tile)] border border-dashed border-rule px-3 text-center text-[13px] text-steel">
              Bed is clear
            </li>
          )}
        </ol>
      </SortableContext>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add an order to ${STATUS_LABEL[column]}`}
          className="flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-tile)] border-[1.5px] border-dashed border-[#B9CDD2] text-[14px] font-semibold text-teal hover:border-teal hover:bg-surface"
        >
          <Plus size={16} aria-hidden="true" /> Add
        </button>
      )}
    </section>
  );
}

function SortableCard({
  card,
  labels,
  today,
  onOpen,
  onConfirmPrint,
  dragging,
}: {
  card: OrderCardView;
  labels: Map<string, LabelView>;
  today: string;
  onOpen: (id: string) => void;
  onConfirmPrint?: (card: OrderCardView) => void;
  dragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: card.id });
  return (
    <OrderCard
      card={card}
      labels={labels}
      today={today}
      onOpen={onOpen}
      onConfirmPrint={onConfirmPrint}
      dragging={dragging}
      rootRef={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      rootProps={listeners}
      handleRef={setActivatorNodeRef}
      handleProps={{ 'aria-describedby': attributes['aria-describedby'] }}
    />
  );
}
