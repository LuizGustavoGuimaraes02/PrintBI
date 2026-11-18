import {
  divide,
  multiply,
  type adjustLotSchema,
  type consumptionSchema,
  type Currency,
  type InventoryItemView,
  type InventoryLotView,
  type InventorySummaryView,
  type itemInputSchema,
  type lotInputSchema,
  type Money,
  type StockMovementView,
  type updateLotSchema,
} from '@printbi/shared';
import { Types, type ClientSession } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import { createExpense } from '../expenses/expenses.service';
import { filamentProductExists } from '../filament-catalog/filament-catalog.service';
import { UserModel } from '../users/user.model';
import { InventoryItemModel, StockMovementModel } from './inventory.model';
import { applyMovement, runOnce, type LedgerContext } from './stock-ledger';

type ItemInput = z.output<typeof itemInputSchema>;
type LotInput = z.output<typeof lotInputSchema>;

export interface Actor {
  companyId: Types.ObjectId;
  userId: Types.ObjectId;
  canSeeFinance: boolean;
  canManageFinance: boolean;
}

interface LotRecord {
  _id: Types.ObjectId;
  label: string;
  originalQuantity: number;
  remaining: number;
  status: InventoryLotView['status'];
  purchasedAt?: Date | null;
  openedAt?: Date | null;
  store?: string | null;
  notes?: string | null;
  totalCost?: Money | null;
  unitCost?: Money | null;
  expenseId?: Types.ObjectId | null;
  used?: boolean | null;
}

interface ItemRecord {
  _id: Types.ObjectId;
  kind: InventoryItemView['kind'];
  name: string;
  unit: InventoryItemView['unit'];
  customUnit?: string | null;
  category?: string | null;
  description?: string | null;
  filament?:
    | (Omit<NonNullable<InventoryItemView['filament']>, 'productId'> & {
        productId?: Types.ObjectId | null;
      })
    | null;
  lowStockThreshold?: number | null;
  notes?: string | null;
  archivedAt?: Date | null;
  lots: LotRecord[];
  updatedAt: Date;
}

const money = (m?: Money | null): Money | null =>
  m ? { amount: m.amount, currency: m.currency } : null;

function lotView(lot: LotRecord, finance: boolean): InventoryLotView {
  return {
    id: lot._id.toString(),
    label: lot.label,
    originalQuantity: lot.originalQuantity,
    remaining: lot.remaining,
    status: lot.status,
    purchasedAt: lot.purchasedAt?.toISOString() ?? null,
    openedAt: lot.openedAt?.toISOString() ?? null,
    store: lot.store ?? '',
    notes: lot.notes ?? '',
    totalCost: finance ? money(lot.totalCost) : null,
    unitCost: finance ? money(lot.unitCost) : null,
    expenseId: finance ? (lot.expenseId?.toString() ?? null) : null,
    used: Boolean(lot.used),
  };
}

/** Stock value per currency: remaining × the lot's own unit cost. Currencies never mix. */
function valueOf(lots: LotRecord[]): Money[] {
  const totals = new Map<Currency, number>();
  for (const lot of lots) {
    if (lot.status === 'archived' || !lot.unitCost || lot.remaining === 0) continue;
    const value = multiply(lot.remaining, lot.unitCost.amount);
    totals.set(lot.unitCost.currency, (totals.get(lot.unitCost.currency) ?? 0) + value);
  }
  return [...totals].map(([currency, amount]) => ({ amount, currency }));
}

export function itemView(item: ItemRecord, finance: boolean): InventoryItemView {
  const active = item.lots.filter((l) => l.status !== 'archived');
  const remaining = active.reduce((sum, l) => sum + l.remaining, 0);
  const threshold = item.lowStockThreshold ?? null;
  const f = item.filament;
  return {
    id: item._id.toString(),
    kind: item.kind,
    name: item.name,
    unit: item.unit,
    customUnit: item.customUnit ?? '',
    category: item.category ?? '',
    description: item.description ?? '',
    filament: f
      ? {
          productId: f.productId?.toString() ?? null,
          materialType: f.materialType,
          brand: f.brand ?? '',
          colorKey: f.colorKey ?? null,
          colorName: f.colorName,
          colorHex: f.colorHex ?? null,
          diameterMm: f.diameterMm ?? 1.75,
          densityGcm3: f.densityGcm3 ?? null,
          nozzleTempMin: f.nozzleTempMin ?? null,
          nozzleTempMax: f.nozzleTempMax ?? null,
          bedTempMin: f.bedTempMin ?? null,
          bedTempMax: f.bedTempMax ?? null,
        }
      : null,
    lowStockThreshold: threshold,
    notes: item.notes ?? '',
    archived: Boolean(item.archivedAt),
    remaining,
    activeLots: active.filter((l) => l.status !== 'empty').length,
    out: remaining === 0,
    low: threshold !== null && remaining > 0 && remaining <= threshold,
    value: finance ? valueOf(item.lots) : null,
    lots: item.lots.map((lot) => lotView(lot, finance)),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function loadItem(
  companyId: Types.ObjectId,
  itemId: Types.ObjectId,
  session?: ClientSession,
) {
  const item = await InventoryItemModel.findOne({ _id: itemId, companyId }, null, {
    session,
  }).lean();
  if (!item) throw new NotFoundError('Stock item');
  return item as unknown as ItemRecord;
}

export async function getItem(actor: Actor, itemId: Types.ObjectId): Promise<InventoryItemView> {
  return itemView(await loadItem(actor.companyId, itemId), actor.canSeeFinance);
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface ItemFilters {
  kind?: InventoryItemView['kind'] | undefined;
  archived?: boolean | undefined;
  stock?: 'low' | 'out' | undefined;
  q?: string | undefined;
}

export async function listItems(actor: Actor, filters: ItemFilters): Promise<InventoryItemView[]> {
  const query: Record<string, unknown> = {
    companyId: actor.companyId,
    archivedAt: filters.archived ? { $ne: null } : null,
  };
  if (filters.kind) query.kind = filters.kind;
  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), 'i');
    query.$or = [
      { name: pattern },
      { category: pattern },
      { 'filament.brand': pattern },
      { 'filament.colorName': pattern },
      { 'filament.materialType': pattern },
    ];
  }
  const items = (await InventoryItemModel.find(query)
    .sort({ kind: 1, name: 1 })
    .lean()) as unknown as ItemRecord[];
  return items
    .map((item) => itemView(item, actor.canSeeFinance))
    .filter((view) =>
      filters.stock === 'low' ? view.low : filters.stock === 'out' ? view.out : true,
    );
}

export async function inventorySummary(actor: Actor): Promise<InventorySummaryView> {
  const items = (await InventoryItemModel.find({
    companyId: actor.companyId,
    archivedAt: null,
  }).lean()) as unknown as ItemRecord[];
  const views = items.map((item) => itemView(item, true));
  const totals = new Map<Currency, number>();
  views
    .flatMap((v) => v.value ?? [])
    .forEach((m) => totals.set(m.currency, (totals.get(m.currency) ?? 0) + m.amount));
  return {
    filamentItems: views.filter((v) => v.kind === 'filament').length,
    filamentGrams: views
      .filter((v) => v.kind === 'filament')
      .reduce((sum, v) => sum + v.remaining, 0),
    lowStockItems: views.filter((v) => v.low).length,
    outOfStockItems: views.filter((v) => v.out).length,
    value: actor.canSeeFinance
      ? [...totals].map(([currency, amount]) => ({ amount, currency }))
      : null,
  };
}

/** Definition fields as stored: filament items are always counted in grams. */
async function definition(input: ItemInput) {
  if (input.kind === 'filament') {
    const productId = input.filament.productId
      ? new Types.ObjectId(input.filament.productId)
      : null;
    if (productId && !(await filamentProductExists(productId))) {
      throw new ValidationError('Some fields are invalid', [
        { path: 'filament.productId', message: 'Unknown filament product' },
      ]);
    }
    return {
      kind: input.kind,
      name: input.name,
      unit: 'g' as const,
      customUnit: '',
      category: '',
      description: '',
      lowStockThreshold: input.lowStockThreshold,
      notes: input.notes,
      filament: {
        ...input.filament,
        productId,
        colorHex: input.filament.colorKey ? null : input.filament.colorHex,
      },
    };
  }
  if (input.unit === 'custom' && !input.customUnit) {
    throw new ValidationError('Some fields are invalid', [
      { path: 'customUnit', message: 'Name the unit' },
    ]);
  }
  return {
    kind: input.kind,
    name: input.name,
    unit: input.unit,
    customUnit: input.unit === 'custom' ? input.customUnit : '',
    category: input.category,
    description: input.description,
    lowStockThreshold: input.lowStockThreshold,
    notes: input.notes,
    filament: null,
  };
}

function assertMayRecordCosts(actor: Actor, lot: LotInput) {
  if (lot.totalCost && !actor.canSeeFinance)
    throw new ForbiddenError('You cannot record costs without financial access');
  if (lot.expense && !actor.canManageFinance)
    throw new ForbiddenError('You cannot record expenses without financial access');
}

/**
 * Adds a lot inside a transaction. The opening quantity enters through the ledger
 * (a purchase movement), so the ledger always explains every gram on the shelf.
 */
async function insertLot(
  ctx: LedgerContext,
  itemId: Types.ObjectId,
  lot: LotInput,
  line = 0,
): Promise<Types.ObjectId> {
  const { companyId, session } = ctx;
  const counter = await InventoryItemModel.findOneAndUpdate(
    { _id: itemId, companyId },
    { $inc: { lotCounter: 1 } },
    { session, returnDocument: 'after', projection: { lotCounter: 1, kind: 1, name: 1 } },
  ).lean();
  if (!counter) throw new NotFoundError('Stock item');

  const lotId = new Types.ObjectId();
  const label =
    lot.label || `${counter.kind === 'filament' ? 'Roll' : 'Lot'} ${counter.lotCounter}`;
  const unitCost = lot.totalCost
    ? {
        amount: divide(lot.totalCost.amount, lot.originalQuantity),
        currency: lot.totalCost.currency,
      }
    : null;

  await InventoryItemModel.updateOne(
    { _id: itemId, companyId },
    {
      $push: {
        lots: {
          _id: lotId,
          label,
          originalQuantity: lot.originalQuantity,
          remaining: 0,
          status: 'sealed',
          purchasedAt: lot.purchasedAt,
          store: lot.store,
          notes: lot.notes,
          totalCost: lot.totalCost,
          unitCost,
        },
      },
    },
    { session },
  );

  if (lot.remaining > 0) {
    await applyMovement(ctx, {
      itemId,
      lotId,
      type: 'purchase',
      delta: lot.remaining,
      reason:
        lot.remaining === lot.originalQuantity ? 'New stock' : 'Opening balance (partly used)',
      line,
    });
  }
  // A brand-new lot is sealed; one registered partly used is already open.
  const status =
    lot.remaining === 0 ? 'empty' : lot.remaining === lot.originalQuantity ? 'sealed' : 'in_use';
  await InventoryItemModel.updateOne(
    { _id: itemId, companyId, 'lots._id': lotId },
    { $set: { 'lots.$.status': status } },
    { session },
  );

  if (lot.expense && lot.totalCost) {
    const purchasedAt = lot.purchasedAt ?? new Date();
    const expenseId = await createExpense(
      companyId,
      ctx.actorId,
      {
        description: `${counter.name} · ${label}`,
        categoryId: lot.expense.categoryId,
        amount: lot.totalCost,
        purchasedAt,
        vendor: lot.store,
        dueDate: null,
        notes: '',
        payments: lot.expense.paidAt
          ? [
              {
                amount: lot.totalCost.amount,
                paidAt: lot.expense.paidAt,
                method: lot.expense.method,
                note: '',
              },
            ]
          : [],
      },
      { session, inventory: { itemId, lotId } },
    );
    await InventoryItemModel.updateOne(
      { _id: itemId, companyId, 'lots._id': lotId },
      { $set: { 'lots.$.expenseId': expenseId } },
      { session },
    );
  }
  return lotId;
}

export async function createItem(
  actor: Actor,
  input: { item: ItemInput; firstLot: LotInput | null },
  key: string,
): Promise<{ item: InventoryItemView; replayed: boolean }> {
  if (input.firstLot) assertMayRecordCosts(actor, input.firstLot);
  const fields = await definition(input.item);

  const create = async (session?: ClientSession) => {
    const item = new InventoryItemModel({
      ...fields,
      companyId: actor.companyId,
      createdBy: actor.userId,
    });
    await item.save({ session });
    return item._id;
  };

  if (!input.firstLot) {
    const itemId = await create();
    await audit({
      companyId: actor.companyId,
      actorId: actor.userId,
      action: 'inventory.item_created',
      entity: 'inventory_item',
      entityId: itemId,
    });
    return { item: await getItem(actor, itemId), replayed: false };
  }

  const firstLot = input.firstLot;
  const { result, replayed } = await runOnce(
    actor.companyId,
    key,
    async (session) => {
      const itemId = await create(session);
      const ctx = { companyId: actor.companyId, actorId: actor.userId, groupKey: key, session };
      await insertLot(ctx, itemId, firstLot);
      // An empty first lot writes no movement, so the key needs one marker to stay idempotent.
      if (firstLot.remaining === 0) await markOperation(ctx, itemId);
      await audit(
        {
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'inventory.item_created',
          entity: 'inventory_item',
          entityId: itemId,
        },
        session,
      );
      return itemId;
    },
    async (movements) => movements[0]?.itemId as Types.ObjectId,
  );
  return { item: await getItem(actor, result), replayed };
}

/** Placeholder ledger row (delta 0) for operations that move no stock but must be idempotent. */
async function markOperation(ctx: LedgerContext, itemId: Types.ObjectId) {
  const item = await InventoryItemModel.findOne(
    { _id: itemId, companyId: ctx.companyId },
    { lots: { $slice: -1 } },
    { session: ctx.session },
  ).lean();
  const lot = item?.lots[0];
  if (!lot) return;
  await StockMovementModel.create(
    [
      {
        companyId: ctx.companyId,
        itemId,
        lotId: lot._id,
        lotLabel: lot.label,
        type: 'purchase',
        delta: 0,
        balanceBefore: 0,
        balanceAfter: 0,
        reason: 'Registered empty',
        groupKey: ctx.groupKey,
        opKey: `${ctx.groupKey}:0`,
        actorId: ctx.actorId,
      },
    ],
    { session: ctx.session },
  );
}

export async function addLot(
  actor: Actor,
  itemId: Types.ObjectId,
  lot: LotInput,
  key: string,
): Promise<{ item: InventoryItemView; replayed: boolean }> {
  assertMayRecordCosts(actor, lot);
  await loadItem(actor.companyId, itemId);
  const { replayed } = await runOnce(
    actor.companyId,
    key,
    async (session) => {
      const ctx = { companyId: actor.companyId, actorId: actor.userId, groupKey: key, session };
      const lotId = await insertLot(ctx, itemId, lot);
      if (lot.remaining === 0) await markOperation(ctx, itemId);
      await audit(
        {
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'inventory.lot_added',
          entity: 'inventory_item',
          entityId: itemId,
          changes: { lotId: lotId.toString() },
        },
        session,
      );
      return lotId;
    },
    async (movements) => movements[0]?.lotId as Types.ObjectId,
  );
  return { item: await getItem(actor, itemId), replayed };
}

export async function updateItem(
  actor: Actor,
  itemId: Types.ObjectId,
  input: ItemInput,
): Promise<InventoryItemView> {
  const current = await loadItem(actor.companyId, itemId);
  if (current.kind !== input.kind && (current.kind === 'filament' || input.kind === 'filament')) {
    throw new ValidationError('Some fields are invalid', [
      { path: 'kind', message: 'A filament cannot become another kind of item' },
    ]);
  }
  const fields = await definition(input);
  if (fields.unit !== current.unit && current.lots.length > 0) {
    throw new ValidationError('Some fields are invalid', [
      { path: 'unit', message: 'The unit cannot change once stock exists' },
    ]);
  }
  await InventoryItemModel.updateOne(
    { _id: itemId, companyId: actor.companyId },
    { $set: fields },
    { runValidators: true },
  );
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'inventory.item_updated',
    entity: 'inventory_item',
    entityId: itemId,
  });
  return getItem(actor, itemId);
}

export async function setItemArchived(
  actor: Actor,
  itemId: Types.ObjectId,
  archived: boolean,
  reason: string,
): Promise<InventoryItemView> {
  const result = await InventoryItemModel.updateOne(
    { _id: itemId, companyId: actor.companyId },
    { $set: { archivedAt: archived ? new Date() : null } },
  );
  if (result.matchedCount !== 1) throw new NotFoundError('Stock item');
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: archived ? 'inventory.item_archived' : 'inventory.item_restored',
    entity: 'inventory_item',
    entityId: itemId,
    reason,
  });
  return getItem(actor, itemId);
}

export async function updateLot(
  actor: Actor,
  itemId: Types.ObjectId,
  lotId: Types.ObjectId,
  input: z.output<typeof updateLotSchema>,
): Promise<InventoryItemView> {
  const item = await loadItem(actor.companyId, itemId);
  const lot = item.lots.find((l) => l._id.equals(lotId));
  if (!lot) throw new NotFoundError('Stock lot');

  const set: Record<string, unknown> = {};
  if (input.label !== undefined) set['lots.$.label'] = input.label;
  if (input.store !== undefined) set['lots.$.store'] = input.store;
  if (input.notes !== undefined) set['lots.$.notes'] = input.notes;
  if (input.purchasedAt !== undefined) set['lots.$.purchasedAt'] = input.purchasedAt;
  if (input.archived !== undefined) {
    set['lots.$.status'] = input.archived
      ? 'archived'
      : lot.remaining === 0
        ? 'empty'
        : lot.used
          ? 'in_use'
          : 'sealed';
  }
  if (input.totalCost !== undefined) {
    if (!actor.canSeeFinance)
      throw new ForbiddenError('You cannot change costs without financial access');
    if (lot.used) {
      throw new AppError(
        409,
        'LOT_USED',
        'Stock was already taken from this lot, so its cost is part of past records',
      );
    }
    set['lots.$.totalCost'] = input.totalCost;
    set['lots.$.unitCost'] = input.totalCost
      ? {
          amount: divide(input.totalCost.amount, lot.originalQuantity),
          currency: input.totalCost.currency,
        }
      : null;
  }
  // `used: false` in the filter closes the race with a consumption landing at the same time.
  const result = await InventoryItemModel.updateOne(
    {
      _id: itemId,
      companyId: actor.companyId,
      lots: { $elemMatch: { _id: lotId, ...(input.totalCost !== undefined && { used: false }) } },
    },
    { $set: set },
  );
  if (result.matchedCount !== 1)
    throw new AppError(409, 'LOT_USED', 'This lot changed meanwhile. Reload it.');
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'inventory.lot_updated',
    entity: 'inventory_item',
    entityId: itemId,
    changes: { lotId: lotId.toString(), ...input },
  });
  return getItem(actor, itemId);
}

export async function movementViews(
  companyId: Types.ObjectId,
  rows: Awaited<ReturnType<typeof listRawMovements>>,
  finance: boolean,
): Promise<StockMovementView[]> {
  const actors = await UserModel.find(
    { _id: { $in: [...new Set(rows.map((r) => r.actorId.toString()))] } },
    { firstName: 1, lastName: 1 },
  ).lean();
  const names = new Map(actors.map((a) => [a._id.toString(), `${a.firstName} ${a.lastName}`]));
  const reversed = await StockMovementModel.find(
    { companyId, reversalOf: { $in: rows.map((r) => r._id) } },
    { reversalOf: 1 },
  ).lean();
  const reversedIds = new Set(reversed.map((r) => r.reversalOf?.toString()));
  return rows.map((r) => ({
    id: r._id.toString(),
    itemId: r.itemId.toString(),
    lotId: r.lotId.toString(),
    lotLabel: r.lotLabel,
    type: r.type as StockMovementView['type'],
    delta: r.delta,
    balanceBefore: r.balanceBefore,
    balanceAfter: r.balanceAfter,
    unitCost: finance ? money(r.unitCost as Money | null) : null,
    reason: r.reason ?? '',
    reversalOf: r.reversalOf?.toString() ?? null,
    reversed: reversedIds.has(r._id.toString()),
    actorName: names.get(r.actorId.toString()) ?? 'Former member',
    orderId: r.orderId?.toString() ?? null,
    saleId: r.saleId?.toString() ?? null,
    createdAt: (r.createdAt as Date).toISOString(),
  }));
}

async function listRawMovements(companyId: Types.ObjectId, filter: Record<string, unknown>) {
  return StockMovementModel.find({ companyId, delta: { $ne: 0 }, ...filter })
    .sort({ createdAt: -1, _id: -1 })
    .limit(300)
    .lean();
}

export async function listMovements(
  actor: Actor,
  itemId: Types.ObjectId,
): Promise<StockMovementView[]> {
  await loadItem(actor.companyId, itemId);
  return movementViews(
    actor.companyId,
    await listRawMovements(actor.companyId, { itemId }),
    actor.canSeeFinance,
  );
}

/**
 * Records actual usage or loss across several lots as one all-or-nothing operation.
 * If any line lacks stock, nothing is deducted and the error names the lot.
 */
export async function recordConsumption(
  actor: Actor,
  input: z.output<typeof consumptionSchema>,
  key: string,
): Promise<{ movements: StockMovementView[]; replayed: boolean }> {
  const { result, replayed } = await runOnce(
    actor.companyId,
    key,
    async (session) => {
      const ctx: LedgerContext = {
        companyId: actor.companyId,
        actorId: actor.userId,
        groupKey: key,
        session,
        orderId: input.orderId ? new Types.ObjectId(input.orderId) : null,
        saleId: input.saleId ? new Types.ObjectId(input.saleId) : null,
      };
      const written = [];
      for (const [line, entry] of input.lines.entries()) {
        written.push(
          await applyMovement(ctx, {
            itemId: new Types.ObjectId(entry.itemId),
            lotId: new Types.ObjectId(entry.lotId),
            type: input.type,
            delta: -entry.quantity,
            reason:
              input.reason || (input.type === 'loss' ? 'Failed print or waste' : 'Used in a print'),
            line,
          }),
        );
      }
      return written.map((m) => m._id);
    },
    async (movements) => movements.map((m) => m._id),
  );
  const rows = await StockMovementModel.find({ companyId: actor.companyId, _id: { $in: result } })
    .sort({ opKey: 1 })
    .lean();
  return { movements: await movementViews(actor.companyId, rows, actor.canSeeFinance), replayed };
}

/** Sets a lot to a counted quantity (a weighed spool), recording the difference. */
export async function adjustLot(
  actor: Actor,
  itemId: Types.ObjectId,
  lotId: Types.ObjectId,
  input: z.output<typeof adjustLotSchema>,
  key: string,
): Promise<{ item: InventoryItemView; replayed: boolean }> {
  const { replayed } = await runOnce(
    actor.companyId,
    key,
    async (session) => {
      const item = await loadItem(actor.companyId, itemId, session);
      const lot = item.lots.find((l) => l._id.equals(lotId));
      if (!lot) throw new NotFoundError('Stock lot');
      const delta = input.countedQuantity - lot.remaining;
      if (delta === 0) {
        throw new ValidationError('Some fields are invalid', [
          { path: 'countedQuantity', message: 'The count matches what is recorded' },
        ]);
      }
      const ctx = { companyId: actor.companyId, actorId: actor.userId, groupKey: key, session };
      return applyMovement(ctx, {
        itemId,
        lotId,
        type: 'adjustment',
        delta,
        reason: input.reason,
        line: 0,
      });
    },
    async (movements) => movements[0],
  );
  return { item: await getItem(actor, itemId), replayed };
}

/**
 * Corrects a past movement by writing its exact opposite. History is never rewritten,
 * and each movement can be reversed only once (unique index on reversalOf).
 */
export async function reverseMovement(
  actor: Actor,
  movementId: Types.ObjectId,
  reason: string,
  key: string,
): Promise<{ item: InventoryItemView; replayed: boolean }> {
  const original = await StockMovementModel.findOne({
    _id: movementId,
    companyId: actor.companyId,
  }).lean();
  if (!original || original.delta === 0) throw new NotFoundError('Stock movement');
  if (original.reversalOf)
    throw new AppError(
      409,
      'IS_CORRECTION',
      'A correction cannot be reversed. Record a new movement instead.',
    );

  const { replayed } = await runOnce(
    actor.companyId,
    key,
    async (session) => {
      if (
        await StockMovementModel.exists({
          companyId: actor.companyId,
          reversalOf: movementId,
        }).session(session)
      ) {
        throw new AppError(409, 'ALREADY_REVERSED', 'This movement was already corrected');
      }
      const ctx = {
        companyId: actor.companyId,
        actorId: actor.userId,
        groupKey: key,
        session,
        orderId: original.orderId,
        saleId: original.saleId,
      };
      return applyMovement(ctx, {
        itemId: original.itemId,
        lotId: original.lotId,
        type: 'correction',
        delta: -original.delta,
        reason,
        line: 0,
        reversalOf: movementId,
      });
    },
    async (movements) => movements[0],
  );
  return { item: await getItem(actor, original.itemId), replayed };
}
