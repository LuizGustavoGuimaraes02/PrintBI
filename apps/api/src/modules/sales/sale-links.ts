import type { Currency, Money } from '@printbi/shared';
import type { ClientSession, Types } from 'mongoose';
import { ConflictError, NotFoundError } from '../../core/errors';
import { StockMovementModel } from '../inventory/inventory.model';
import { summarizeUsage } from '../orders/order-links';
import { SaleModel } from './sale.model';

/**
 * The sale side of the stock ledger and of deletions. Like order-links, it depends only on the
 * models, so other services can call it inside their own transactions.
 */

/** Stock can be recorded on a sale only when it exists here and has no order (that records it). */
export async function assertSaleTakesStock(
  companyId: Types.ObjectId,
  saleId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  const sale = await SaleModel.findOne({ _id: saleId, companyId }, { orderId: 1 })
    .session(session)
    .lean();
  if (!sale) throw new NotFoundError('Sale');
  if (sale.orderId) {
    throw new ConflictError('This sale has an order: record the stock it used on the order.');
  }
}

/** Sums the sale's own ledger rows again, in the same transaction as the movement. */
export async function refreshSaleCost(
  companyId: Types.ObjectId,
  saleId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  const rows = await StockMovementModel.find(
    { companyId, saleId },
    { type: 1, delta: 1, unitCost: 1, reversalOf: 1 },
    { session },
  ).lean();
  await SaleModel.updateOne(
    { _id: saleId, companyId },
    { $set: { costSummary: summarizeUsage(rows) } },
    { session },
  );
}

const USED_BY = {
  customer: {
    path: 'customer.customerId',
    message: 'This customer has sales. Archive them instead.',
  },
  product: { path: 'lines.productId', message: 'This product is in sales. Archive it instead.' },
} as const;

/** A record that real sales point to is part of their history: it is archived, not deleted. */
export async function assertNotInSales(
  companyId: Types.ObjectId,
  kind: keyof typeof USED_BY,
  id: Types.ObjectId,
): Promise<void> {
  const { path, message } = USED_BY[kind];
  if (await SaleModel.exists({ companyId, [path]: id })) throw new ConflictError(message);
}

/** Each customer's sales that count (not cancelled): how many, and the total per currency. */
export async function salesByCustomer(
  companyId: Types.ObjectId,
  customerIds: Types.ObjectId[],
): Promise<Map<string, { count: number; totals: Money[] }>> {
  const result = new Map<string, { count: number; totals: Money[] }>();
  if (customerIds.length === 0) return result;
  const rows = await SaleModel.aggregate<{
    _id: { customerId: Types.ObjectId; currency: Currency };
    count: number;
    total: number;
  }>([
    { $match: { companyId, 'customer.customerId': { $in: customerIds }, cancelledAt: null } },
    {
      $group: {
        _id: { customerId: '$customer.customerId', currency: '$currency' },
        count: { $sum: 1 },
        total: { $sum: '$total' },
      },
    },
  ]);
  for (const row of rows) {
    const key = row._id.customerId.toString();
    const entry = result.get(key) ?? { count: 0, totals: [] };
    entry.count += row.count;
    entry.totals.push({ currency: row._id.currency, amount: row.total });
    result.set(key, entry);
  }
  return result;
}

/** Units of each product sold in sales that count, in whole units. */
export async function soldByProduct(
  companyId: Types.ObjectId,
  productIds: Types.ObjectId[],
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await SaleModel.aggregate<{ _id: Types.ObjectId; quantity: number }>([
    { $match: { companyId, 'lines.productId': { $in: productIds }, cancelledAt: null } },
    { $unwind: '$lines' },
    { $match: { 'lines.productId': { $in: productIds } } },
    { $group: { _id: '$lines.productId', quantity: { $sum: '$lines.quantity' } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), Math.round(r.quantity / 1_000_000)]));
}
