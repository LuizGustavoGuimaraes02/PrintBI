import {
  isSettled,
  multiply,
  nextSettledAt,
  roundToCents,
  type Currency,
  type Money,
  type OrderStatus,
  type OrderType,
  type PaymentStatus,
  type SalePayment,
} from '@printbi/shared';
import type { ClientSession, Types } from 'mongoose';
import { ConflictError, NotFoundError } from '../../core/errors';
import { StockMovementModel } from '../inventory/inventory.model';
import { OrderModel } from './order.model';

/**
 * The order side of the stock ledger. It depends only on the models, so the inventory
 * service can call it inside its own transaction without importing the orders service.
 */

/** Stock can be recorded against an order only when the order exists in this company. */
export async function assertOrderExists(
  companyId: Types.ObjectId,
  orderId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  if (!(await OrderModel.exists({ _id: orderId, companyId }).session(session))) {
    throw new NotFoundError('Order');
  }
}

interface LedgerRow {
  _id: Types.ObjectId;
  type: string;
  delta: number;
  unitCost?: Money | null;
  reversalOf?: Types.ObjectId | null;
}

/** Usage cost per currency from the ledger rows: corrections count against what they undo. */
export function summarizeUsage(rows: LedgerRow[]) {
  const typeOf = new Map(rows.map((r) => [r._id.toString(), r.type]));
  const reversed = new Set(rows.flatMap((r) => (r.reversalOf ? [r.reversalOf.toString()] : [])));
  const totals = { consumption: new Map<Currency, number>(), loss: new Map<Currency, number>() };
  let unpricedLines = 0;
  for (const row of rows) {
    const kind =
      row.type === 'correction' ? typeOf.get(row.reversalOf?.toString() ?? '') : row.type;
    if (kind !== 'consumption' && kind !== 'loss') continue;
    if (!row.unitCost) {
      if (row.type !== 'correction' && !reversed.has(row._id.toString())) unpricedLines += 1;
      continue;
    }
    const map = totals[kind];
    const cost = multiply(-row.delta, row.unitCost.amount);
    map.set(row.unitCost.currency, (map.get(row.unitCost.currency) ?? 0) + cost);
  }
  const list = (map: Map<Currency, number>): Money[] =>
    [...map]
      .map(([currency, amount]) => ({ currency, amount: roundToCents(amount) }))
      .filter((m) => m.amount !== 0);
  return {
    materials: list(totals.consumption),
    losses: list(totals.loss),
    unpricedLines,
    lines: rows.length,
  };
}

/**
 * Sums the order's ledger rows again and stores the result, in the same transaction as the
 * movement that changed it. Recording usage also counts as progress for reminders.
 */
export async function refreshOrderCost(
  companyId: Types.ObjectId,
  orderId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  const rows = (await StockMovementModel.find(
    { companyId, orderId },
    { type: 1, delta: 1, unitCost: 1, reversalOf: 1 },
    { session },
  ).lean()) as LedgerRow[];
  await OrderModel.updateOne(
    { _id: orderId, companyId },
    { $set: { costSummary: summarizeUsage(rows), 'reminder.lastProgressAt': new Date() } },
    { session },
  );
}

/**
 * A sale registered from an order decides the order's payment: the order shows it, and the
 * board's retention clock (done and paid) follows the sale's receipts. `sale: null` unlinks it
 * and leaves the payment as it was, to be changed by hand again.
 */
export async function syncOrderWithSale(
  companyId: Types.ObjectId,
  orderId: Types.ObjectId,
  sale: { id: Types.ObjectId; payment: SalePayment; total: Money } | null,
  session?: ClientSession,
): Promise<void> {
  const order = (await OrderModel.findOne(
    { _id: orderId, companyId },
    { type: 1, status: 1, paymentStatus: 1, paidAt: 1, settledAt: 1 },
  )
    .session(session ?? null)
    .lean()) as {
    type: OrderType;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paidAt?: Date | null;
    settledAt?: Date | null;
  } | null;
  if (!order) throw new NotFoundError('Order');
  if (!sale) {
    await OrderModel.updateOne(
      { _id: orderId, companyId },
      { $set: { saleId: null } },
      { session },
    );
    return;
  }
  const now = new Date();
  const paymentStatus: PaymentStatus = sale.payment;
  const paidAt =
    paymentStatus !== 'paid' ? null : order.paymentStatus === 'paid' ? (order.paidAt ?? now) : now;
  const settledAt = nextSettledAt(
    order.settledAt ?? null,
    isSettled({ type: order.type, status: order.status, paymentStatus }),
    now,
  );
  await OrderModel.updateOne(
    { _id: orderId, companyId },
    { $set: { saleId: sale.id, paymentStatus, paidAt, settledAt, agreedPrice: sale.total } },
    { session },
  );
}

const USED_BY = {
  customer: {
    path: 'recipient.customerId',
    message: 'This customer has orders. Archive them instead.',
  },
  product: { path: 'productId', message: 'This product is used by orders. Archive it instead.' },
  printer: { path: 'printerId', message: 'This printer has orders. Archive it instead.' },
} as const;

/**
 * Deleting fixes mistakes; a record that real orders point to is part of their history,
 * so it is archived instead.
 */
export async function assertNotInOrders(
  companyId: Types.ObjectId,
  kind: keyof typeof USED_BY,
  id: Types.ObjectId,
): Promise<void> {
  const { path, message } = USED_BY[kind];
  if (await OrderModel.exists({ companyId, [path]: id })) throw new ConflictError(message);
}
