import {
  formatMoney,
  type InventoryItemView,
  type InventoryLotView,
  type StockMovementView,
} from '@printbi/shared';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Badge,
  Button,
  cn,
  ColorSwatch,
  ConfirmDialog,
  EmptyState,
  FilamentBar,
  PageLoader,
  Panel,
  SpoolGauge,
  useToast,
} from '../../design-system';
import { filamentFinish, filamentStops } from '../../design-system/ColorSwatch';
import { api } from '../../lib/api';
import { showUnitMoney } from '../../lib/money';
import { showQuantity, unitLabel } from '../../lib/quantity';
import { useCan } from '../auth/account';
import { ConsumeDialog } from './ConsumeDialog';
import { DeleteStockDialog } from './DeleteStockDialog';
import {
  AddLotDialog,
  AdjustDialog,
  EditItemDialog,
  LotDetailsDialog,
  ReverseDialog,
} from './ItemDialogs';
import { useInventoryItem, useMovements, useRefreshInventory } from './queries';

const dateFormat = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeZone: 'UTC' });
const dateTimeFormat = new Intl.DateTimeFormat('en-CA', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const STATUS: Record<
  InventoryLotView['status'],
  { label: string; tone: 'teal' | 'neutral' | 'hot' }
> = {
  sealed: { label: 'Sealed', tone: 'neutral' },
  in_use: { label: 'In use', tone: 'teal' },
  empty: { label: 'Empty', tone: 'neutral' },
  archived: { label: 'Archived', tone: 'neutral' },
};

const MOVEMENT_LABEL: Record<StockMovementView['type'], string> = {
  purchase: 'Stock in',
  consumption: 'Used',
  loss: 'Lost',
  adjustment: 'Count correction',
  return: 'Returned',
  correction: 'Entry corrected',
};

type Dialog =
  | { kind: 'consume' }
  | { kind: 'addLot' }
  | { kind: 'edit' }
  | { kind: 'archive' }
  | { kind: 'delete'; lot?: InventoryLotView }
  | { kind: 'adjust'; lot: InventoryLotView }
  | { kind: 'lot'; lot: InventoryLotView }
  | { kind: 'reverse'; movement: StockMovementView };

export function ItemPage() {
  const { itemId = '' } = useParams();
  const { data: item, isPending } = useInventoryItem(itemId);
  if (isPending) return <PageLoader label="Loading item" />;
  if (!item) {
    return (
      <EmptyState
        title="Item not found"
        action={
          <Link to="/inventory" className="font-semibold text-teal">
            Back to inventory
          </Link>
        }
      >
        It may have been removed, or it belongs to another business.
      </EmptyState>
    );
  }
  return <ItemDetail item={item} />;
}

function Fact({ label, value, attention }: { label: string; value: string; attention?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-rule-soft py-3">
      <dt className="label-mono text-ink-muted">{label}</dt>
      <dd className={cn('figure text-[18px] font-medium', attention && 'text-hot-ink')}>{value}</dd>
    </div>
  );
}

function ItemDetail({ item }: { item: InventoryItemView }) {
  const toast = useToast();
  const navigate = useNavigate();
  const refresh = useRefreshInventory();
  const canSeeFinance = useCan('finance:view');
  const canArchive = useCan('records:archive');
  const { data: movements } = useMovements(item.id);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [archiving, setArchiving] = useState(false);
  const close = () => setDialog(null);

  const filament = item.filament;
  const stops = filamentStops(filament);
  const activeLots = item.lots.filter((l) => l.status !== 'archived');
  const capacity = activeLots.reduce((sum, l) => sum + l.originalQuantity, 0);
  const temps = (min: number | null, max: number | null) =>
    min && max ? `${min}–${max} °C` : min || max ? `${min ?? max} °C` : '—';

  const setArchived = async (archived: boolean) => {
    setArchiving(true);
    try {
      await api.post(`/inventory/items/${item.id}/archive`, { archived });
      await refresh();
      toast.success(archived ? 'Item archived' : 'Item restored', item.name);
      close();
    } catch {
      toast.error('Not changed');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <>
      <Link
        to="/inventory"
        className="inline-flex items-center gap-2 self-start px-1 text-[15px] font-semibold text-teal hover:text-teal-strong"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Inventory
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div className="flex items-center gap-4">
          {filament ? (
            <SpoolGauge remaining={item.remaining} capacity={capacity} color={stops} size={88} />
          ) : (
            <span className="figure grid size-20 place-items-center rounded-3xl bg-surface text-sm text-ink-muted uppercase">
              {unitLabel(item)}
            </span>
          )}
          <div className="flex flex-col gap-1">
            <span className="label-mono text-ink-muted">
              {filament ? 'Filament' : item.category || item.kind}
            </span>
            <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.03em] md:text-[40px]">
              {item.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {filament && (
                <span className="flex items-center gap-2 text-[15px] text-ink-muted">
                  <ColorSwatch stops={stops} finish={filamentFinish(filament)} size={18} />
                  {filament.colorName}
                </span>
              )}
              {item.out && <Badge tone="hot">Out of stock</Badge>}
              {item.low && <Badge tone="hot">Low</Badge>}
              {item.archived && <Badge>Archived</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            hint={
              item.remaining === 0
                ? 'Nothing left to deduct: add a roll first.'
                : 'Deducts what a print used from stock right away. For a job on the board, use Confirm print on its Done card instead, so it is not deducted twice.'
            }
            onClick={() => setDialog({ kind: 'consume' })}
            disabled={item.remaining === 0}
          >
            Record usage
          </Button>
          <Button variant="soft" onClick={() => setDialog({ kind: 'addLot' })}>
            {filament ? 'Add roll' : 'Add stock'}
          </Button>
          <Button variant="ghost" onClick={() => setDialog({ kind: 'edit' })}>
            Edit
          </Button>
          {canArchive &&
            (item.archived ? (
              <Button
                variant="ghost"
                loading={archiving}
                hint="Brings it back to the stock list and the pickers."
                onClick={() => void setArchived(false)}
              >
                Restore
              </Button>
            ) : (
              <Button
                variant="ghost"
                hint="Hides it from the list and the pickers. Its rolls, history and costs stay; you can restore it."
                onClick={() => setDialog({ kind: 'archive' })}
              >
                Archive
              </Button>
            ))}
          {canArchive && (
            <Button
              variant="ghost"
              className="text-hot-ink hover:bg-hot-soft hover:text-hot-ink"
              hint="Deletes it with its rolls and history, for something entered by mistake. Archive keeps the history."
              onClick={() => setDialog({ kind: 'delete' })}
            >
              Delete
            </Button>
          )}
        </div>
      </header>

      <Panel>
        <dl className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
          <Fact
            label="Left now"
            value={showQuantity(item.remaining, item)}
            attention={item.low || item.out}
          />
          <Fact
            label={filament ? 'Rolls in use or sealed' : 'Open lots'}
            value={String(item.activeLots)}
          />
          {filament ? (
            <Fact
              label="Rolls running low"
              value={item.lowLots === 0 ? 'None' : String(item.lowLots)}
              attention={item.lowLots > 0}
            />
          ) : (
            <Fact
              label="Low-stock warning"
              value={
                item.lowStockThreshold !== null
                  ? `at ${showQuantity(item.lowStockThreshold, item)}`
                  : 'Off'
              }
            />
          )}
          {canSeeFinance && (
            <Fact
              label="Stock value"
              value={
                item.value && item.value.length > 0
                  ? item.value.map((v) => formatMoney(v)).join(' + ')
                  : '—'
              }
            />
          )}
          {filament && (
            <>
              <Fact
                label="Material"
                value={[filament.brand, filament.materialType].filter(Boolean).join(' · ')}
              />
              <Fact
                label="Diameter · density"
                value={`${filament.diameterMm} mm${filament.densityGcm3 ? ` · ${filament.densityGcm3} g/cm³` : ''}`}
              />
              <Fact label="Nozzle" value={temps(filament.nozzleTempMin, filament.nozzleTempMax)} />
              <Fact label="Bed" value={temps(filament.bedTempMin, filament.bedTempMax)} />
            </>
          )}
        </dl>
        {item.notes && <p className="text-[15px] text-ink-muted">{item.notes}</p>}
      </Panel>

      <Panel
        title={filament ? 'Rolls' : 'Lots'}
        description="Each one keeps its own quantity and the price it was bought at."
      >
        {item.lots.length === 0 ? (
          <EmptyState
            title="No stock yet"
            action={
              <Button onClick={() => setDialog({ kind: 'addLot' })}>
                {filament ? 'Add a roll' : 'Add stock'}
              </Button>
            }
          >
            Add what you have on the shelf to start tracking it.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {item.lots.map((lot) => (
              <li
                key={lot.id}
                className={cn(
                  'flex flex-col gap-4 rounded-[var(--radius-tile)] bg-bench p-5',
                  lot.status === 'archived' && 'opacity-70',
                )}
              >
                <div className="flex items-center gap-4">
                  {filament ? (
                    <SpoolGauge
                      remaining={lot.remaining}
                      capacity={lot.originalQuantity}
                      color={stops}
                      size={64}
                      spinning={lot.status === 'in_use'}
                    />
                  ) : null}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-[17px]">{lot.label}</strong>
                      <Badge tone={STATUS[lot.status].tone}>{STATUS[lot.status].label}</Badge>
                      {lot.low && <Badge tone="hot">Low</Badge>}
                    </span>
                    <span className="figure text-[13px] text-ink-muted">
                      {[lot.purchasedAt && dateFormat.format(new Date(lot.purchasedAt)), lot.store]
                        .filter(Boolean)
                        .join(' · ') || 'No purchase details'}
                    </span>
                  </div>
                </div>
                <FilamentBar
                  value={lot.remaining}
                  max={lot.originalQuantity}
                  color={filament && stops.length === 1 ? stops[0] : undefined}
                  label="Left"
                  readout={`${showQuantity(lot.remaining, item)} of ${showQuantity(lot.originalQuantity, item)}`}
                />
                {canSeeFinance && (
                  <p className="figure text-[13px] text-ink-muted">
                    {lot.unitCost
                      ? `${showUnitMoney(lot.unitCost)} per ${item.kind === 'filament' ? 'gram' : unitLabel(item, false)} · paid ${formatMoney(lot.totalCost!)}`
                      : 'Cost unknown'}
                    {lot.expenseId && (
                      <>
                        {' · '}
                        <Link to={`/expenses/${lot.expenseId}`} className="font-semibold text-teal">
                          linked expense
                        </Link>
                      </>
                    )}
                  </p>
                )}
                {lot.effectiveLowStockThreshold !== null && lot.status !== 'archived' && (
                  <p className="figure text-[13px] text-ink-muted">
                    Warns below {showQuantity(lot.effectiveLowStockThreshold, item)}
                    {lot.lowStockThreshold === null
                      ? ' (default for every roll)'
                      : ' (this roll only)'}
                  </p>
                )}
                {lot.notes && <p className="text-[14px] text-ink-muted">{lot.notes}</p>}
                <div className="flex flex-wrap gap-2">
                  {lot.status !== 'archived' && (
                    <Button
                      size="sm"
                      variant="soft"
                      hint="Sets the roll to what you weighed or counted. The difference is logged as a correction."
                      onClick={() => setDialog({ kind: 'adjust', lot })}
                    >
                      Correct quantity
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'lot', lot })}>
                    Edit
                  </Button>
                  <LotArchiveButton item={item} lot={lot} />
                  {canArchive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-hot-ink hover:bg-hot-soft hover:text-hot-ink"
                      hint="Deletes this roll and its history, for a roll entered by mistake."
                      onClick={() => setDialog({ kind: 'delete', lot })}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="History"
        description="Every gram in and out. Entries are never edited; corrections are added instead."
      >
        {!movements ? (
          <PageLoader />
        ) : movements.length === 0 ? (
          <p className="text-ink-muted">No movements yet.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[720px] border-collapse text-[14px]">
              <thead>
                <tr className="label-mono text-left text-ink-muted">
                  <th className="border-b border-rule py-2 pr-3 font-medium">When</th>
                  <th className="border-b border-rule py-2 pr-3 font-medium">What</th>
                  <th className="border-b border-rule py-2 pr-3 font-medium">Lot</th>
                  <th className="border-b border-rule py-2 pr-3 text-right font-medium">Change</th>
                  <th className="border-b border-rule py-2 pr-3 text-right font-medium">After</th>
                  <th className="border-b border-rule py-2 pr-3 font-medium">By · reason</th>
                  <th className="border-b border-rule py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className={cn(m.reversed && 'text-ink-muted')}>
                    <td className="figure border-b border-rule-soft py-3 pr-3 text-[13px] whitespace-nowrap">
                      {dateTimeFormat.format(new Date(m.createdAt))}
                    </td>
                    <td className="border-b border-rule-soft py-3 pr-3">
                      {MOVEMENT_LABEL[m.type]}
                      {m.reversed && <span className="label-mono ml-2 text-[11px]">corrected</span>}
                    </td>
                    <td className="border-b border-rule-soft py-3 pr-3">{m.lotLabel}</td>
                    <td
                      className={cn(
                        'figure border-b border-rule-soft py-3 pr-3 text-right whitespace-nowrap',
                        m.reversed && 'line-through',
                      )}
                    >
                      {m.delta > 0 ? '+' : '−'}
                      {showQuantity(Math.abs(m.delta), item)}
                    </td>
                    <td className="figure border-b border-rule-soft py-3 pr-3 text-right whitespace-nowrap">
                      {showQuantity(m.balanceAfter, item)}
                    </td>
                    <td className="border-b border-rule-soft py-3 pr-3">
                      <span className="block">{m.actorName}</span>
                      {m.reason && (
                        <span className="block text-[13px] text-ink-muted">{m.reason}</span>
                      )}
                    </td>
                    <td className="border-b border-rule-soft py-3 text-right">
                      {!m.reversed && !m.reversalOf && (
                        <Button
                          size="sm"
                          variant="ghost"
                          hint="Undoes this entry with a correction that gives the amount back. The original stays in the history."
                          onClick={() => setDialog({ kind: 'reverse', movement: m })}
                        >
                          Correct
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {dialog?.kind === 'consume' && <ConsumeDialog itemId={item.id} onClose={close} />}
      {dialog?.kind === 'addLot' && <AddLotDialog item={item} onClose={close} />}
      {dialog?.kind === 'edit' && <EditItemDialog item={item} onClose={close} />}
      {dialog?.kind === 'adjust' && <AdjustDialog item={item} lot={dialog.lot} onClose={close} />}
      {dialog?.kind === 'lot' && <LotDetailsDialog item={item} lot={dialog.lot} onClose={close} />}
      {dialog?.kind === 'reverse' && (
        <ReverseDialog item={item} movement={dialog.movement} onClose={close} />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteStockDialog
          item={item}
          lot={dialog.lot}
          onClose={close}
          onDeleted={async () => {
            if (!dialog.lot) void navigate('/inventory', { replace: true });
            await refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={dialog?.kind === 'archive'}
        onOpenChange={(open) => !open && close()}
        title={`Archive ${item.name}?`}
        description="It leaves the active list. Its rolls, history and costs stay in past records, and you can restore it."
        confirmLabel="Archive item"
        loading={archiving}
        onConfirm={() => void setArchived(true)}
      />
    </>
  );
}

function LotArchiveButton({ item, lot }: { item: InventoryItemView; lot: InventoryLotView }) {
  const toast = useToast();
  const refresh = useRefreshInventory();
  const [saving, setSaving] = useState(false);
  const archived = lot.status === 'archived';
  const toggle = async () => {
    setSaving(true);
    try {
      await api.patch(`/inventory/items/${item.id}/lots/${lot.id}`, { archived: !archived });
      await refresh();
      toast.success(archived ? 'Lot restored' : 'Lot archived', lot.label);
    } catch {
      toast.error('Not changed');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={saving}
      hint={
        archived
          ? 'Puts this roll back in use.'
          : 'Sets this roll aside (empty or gone). It stops counting in stock; its history stays.'
      }
      onClick={() => void toggle()}
    >
      {archived ? 'Restore' : 'Archive'}
    </Button>
  );
}
