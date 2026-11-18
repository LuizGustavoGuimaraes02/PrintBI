import type { Money, MovementType } from '@printbi/shared';
import type { Types } from 'mongoose';
import mongoose, { type ClientSession } from 'mongoose';
import { AppError, NotFoundError } from '../../core/errors';
import { isDuplicateKey } from '../../core/http/idempotency';
import { InventoryItemModel, StockMovementModel, type StockMovement } from './inventory.model';

export interface LedgerContext {
  companyId: Types.ObjectId;
  actorId: Types.ObjectId;
  /** Idempotency key of the whole operation. */
  groupKey: string;
  session: ClientSession;
  orderId?: Types.ObjectId | null;
  saleId?: Types.ObjectId | null;
}

export interface MovementInput {
  itemId: Types.ObjectId;
  lotId: Types.ObjectId;
  type: MovementType;
  /** Signed change in micro-units: negative takes stock out. */
  delta: number;
  reason: string;
  /** Line number inside the operation, part of the unique opKey. */
  line: number;
  reversalOf?: Types.ObjectId | null;
}

type MovementDoc = StockMovement & { _id: Types.ObjectId; createdAt: Date };

interface LotSnapshot {
  _id: Types.ObjectId;
  label: string;
  remaining: number;
  status: string;
  unitCost?: Money | null;
}

export class InsufficientStockError extends AppError {
  constructor(lotLabel: string, available: number, details: { itemId: string; lotId: string }) {
    super(409, 'INSUFFICIENT_STOCK', `Not enough left in ${lotLabel}`, { ...details, available });
  }
}

/** The lot status that follows from a new balance. */
function nextStatus(current: string, remaining: number): string {
  if (current === 'archived') return current;
  if (remaining === 0) return 'empty';
  if (current === 'sealed' || current === 'empty') return 'in_use';
  return current;
}

/**
 * Applies one stock change to one lot and writes its ledger row, inside the caller's
 * transaction. Taking stock out is conditional on the lot holding enough, checked by the
 * database itself, so concurrent requests can never drive a lot below zero.
 */
export async function applyMovement(
  ctx: LedgerContext,
  input: MovementInput,
): Promise<MovementDoc> {
  const { companyId, session } = ctx;
  const lotMatch =
    input.delta < 0
      ? { _id: input.lotId, remaining: { $gte: -input.delta }, status: { $ne: 'archived' } }
      : { _id: input.lotId, status: { $ne: 'archived' } };

  const updated = await InventoryItemModel.findOneAndUpdate(
    { _id: input.itemId, companyId, lots: { $elemMatch: lotMatch } },
    {
      $inc: { 'lots.$.remaining': input.delta },
      ...(input.delta < 0 && { $set: { 'lots.$.used': true } }),
    },
    {
      session,
      returnDocument: 'after',
      projection: { lots: { $elemMatch: { _id: input.lotId } } },
    },
  ).lean();
  const lot = updated?.lots[0] as LotSnapshot | undefined;

  if (!lot) {
    const existing = await InventoryItemModel.findOne(
      { _id: input.itemId, companyId, 'lots._id': input.lotId },
      { lots: { $elemMatch: { _id: input.lotId } } },
      { session },
    ).lean();
    const found = existing?.lots[0] as LotSnapshot | undefined;
    if (!found) throw new NotFoundError('Stock lot');
    if (found.status === 'archived') {
      throw new AppError(409, 'LOT_ARCHIVED', `${found.label} is archived. Restore it first.`);
    }
    throw new InsufficientStockError(found.label, found.remaining, {
      itemId: input.itemId.toString(),
      lotId: input.lotId.toString(),
    });
  }

  const status = nextStatus(lot.status, lot.remaining);
  if (status !== lot.status) {
    await InventoryItemModel.updateOne(
      { _id: input.itemId, companyId, 'lots._id': input.lotId },
      {
        $set: {
          'lots.$.status': status,
          ...(status === 'in_use' && lot.status === 'sealed' && { 'lots.$.openedAt': new Date() }),
        },
      },
      { session },
    );
  }

  const [movement] = await StockMovementModel.create(
    [
      {
        companyId,
        itemId: input.itemId,
        lotId: input.lotId,
        lotLabel: lot.label,
        type: input.type,
        delta: input.delta,
        balanceBefore: lot.remaining - input.delta,
        balanceAfter: lot.remaining,
        unitCost: lot.unitCost ?? null,
        reason: input.reason,
        groupKey: ctx.groupKey,
        opKey: `${ctx.groupKey}:${input.line}`,
        reversalOf: input.reversalOf ?? null,
        orderId: ctx.orderId ?? null,
        saleId: ctx.saleId ?? null,
        actorId: ctx.actorId,
      },
    ],
    { session },
  );
  if (!movement) throw new Error('Movement was not written');
  return movement.toObject() as MovementDoc;
}

/**
 * Runs a stock operation exactly once per idempotency key. A key that already wrote
 * movements is answered from those movements instead of running again; two concurrent
 * requests with the same key collide on the unique opKey and the loser replays.
 */
export async function runOnce<T>(
  companyId: Types.ObjectId,
  groupKey: string,
  operation: (session: ClientSession) => Promise<T>,
  replay: (movements: MovementDoc[]) => Promise<T>,
): Promise<{ result: T; replayed: boolean }> {
  const previous = async () =>
    (await StockMovementModel.find({ companyId, groupKey })
      .sort({ opKey: 1 })
      .lean()) as MovementDoc[];

  const earlier = await previous();
  if (earlier.length > 0) return { result: await replay(earlier), replayed: true };

  try {
    return { result: await mongoose.connection.transaction(operation), replayed: false };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const written = await previous();
    if (written.length === 0) throw error;
    return { result: await replay(written), replayed: true };
  }
}
