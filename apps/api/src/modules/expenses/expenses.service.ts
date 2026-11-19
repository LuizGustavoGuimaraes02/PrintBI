import type {
  Currency,
  ExpenseStatus,
  ExpenseSummaryView,
  ExpenseView,
  expenseFiltersSchema,
  expenseInputSchema,
  Money,
  paymentInputSchema,
  updateExpenseSchema,
} from '@printbi/shared';
import mongoose, { Types, type ClientSession } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { AppError, NotFoundError, ValidationError } from '../../core/errors';
import { CompanyModel } from '../companies/company.model';
import { InventoryItemModel } from '../inventory/inventory.model';
import { ExpenseModel, type Expense } from './expense.model';

type ExpenseInput = z.output<typeof expenseInputSchema>;
type PaymentInput = z.output<typeof paymentInputSchema>;
type ExpenseRecord = Expense & {
  _id: Types.ObjectId;
  createdAt: Date;
  payments: (Expense['payments'][number] & { _id: Types.ObjectId })[];
};

export function statusOf(amount: number, paid: number, cancelled: boolean): ExpenseStatus {
  if (cancelled) return 'cancelled';
  if (paid >= amount) return 'paid';
  return paid > 0 ? 'partial' : 'pending';
}

async function categories(companyId: Types.ObjectId, session?: ClientSession) {
  const company = await CompanyModel.findById(
    companyId,
    { expenseCategories: 1 },
    { session },
  ).lean();
  return new Map((company?.expenseCategories ?? []).map((c) => [c._id.toString(), c]));
}

async function assertUsableCategory(
  companyId: Types.ObjectId,
  categoryId: string,
  session?: ClientSession,
) {
  const category = (await categories(companyId, session)).get(categoryId);
  if (!category || category.archivedAt) {
    throw new ValidationError('Some fields are invalid', [
      { path: 'categoryId', message: 'Choose an active category' },
    ]);
  }
}

interface StockNames {
  items: Map<string, string>;
  lots: Map<string, string>;
}

function toView(
  expense: ExpenseRecord,
  names: Map<string, { name: string }>,
  stock: StockNames,
): ExpenseView {
  const amount = expense.amount as Money;
  return {
    id: expense._id.toString(),
    description: expense.description,
    category: {
      id: expense.categoryId.toString(),
      name: names.get(expense.categoryId.toString())?.name ?? 'Unknown',
    },
    amount: { amount: amount.amount, currency: amount.currency },
    paid: expense.paid,
    outstanding: expense.cancelledAt ? 0 : Math.max(0, amount.amount - expense.paid),
    status: expense.status as ExpenseStatus,
    purchasedAt: expense.purchasedAt.toISOString(),
    vendor: expense.vendor ?? '',
    dueDate: expense.dueDate?.toISOString() ?? null,
    notes: expense.notes ?? '',
    payments: expense.payments.map((p) => ({
      id: p._id.toString(),
      amount: p.amount,
      paidAt: p.paidAt.toISOString(),
      method: p.method as ExpenseView['payments'][number]['method'],
      note: p.note ?? '',
    })),
    stock: (expense.stock ?? []).map((s) => ({
      itemId: s.itemId.toString(),
      lotId: s.lotId.toString(),
      itemName: stock.items.get(s.itemId.toString()) ?? 'Stock item',
      lotLabel: stock.lots.get(s.lotId.toString()) ?? '',
    })),
    cancelled: expense.cancelledAt
      ? { at: expense.cancelledAt.toISOString(), reason: expense.cancelReason ?? '' }
      : null,
    createdAt: expense.createdAt.toISOString(),
  };
}

async function toViews(companyId: Types.ObjectId, rows: ExpenseRecord[]): Promise<ExpenseView[]> {
  const names = await categories(companyId);
  const itemIds = rows.flatMap((r) => (r.stock ?? []).map((s) => s.itemId));
  type NamedItem = {
    _id: Types.ObjectId;
    name: string;
    lots: { _id: Types.ObjectId; label: string }[];
  };
  const items = itemIds.length
    ? ((await InventoryItemModel.find(
        { companyId, _id: { $in: itemIds } },
        { name: 1, 'lots._id': 1, 'lots.label': 1 },
      ).lean()) as unknown as NamedItem[])
    : [];
  const stock: StockNames = {
    items: new Map(items.map((i) => [i._id.toString(), i.name])),
    lots: new Map(items.flatMap((i) => i.lots.map((l) => [l._id.toString(), l.label] as const))),
  };
  return rows.map((row) => toView(row, names, stock));
}

export async function getExpense(
  companyId: Types.ObjectId,
  id: Types.ObjectId,
): Promise<ExpenseView> {
  const row = await ExpenseModel.findOne({ _id: id, companyId }).lean();
  if (!row) throw new NotFoundError('Expense');
  const [view] = await toViews(companyId, [row as ExpenseRecord]);
  return view as ExpenseView;
}

function checkPayments(amount: number, payments: PaymentInput[]) {
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  if (total > amount) {
    throw new ValidationError('Some fields are invalid', [
      { path: 'payments', message: 'Payments add up to more than the expense' },
    ]);
  }
  return total;
}

/**
 * Creates an expense. Inside an inventory purchase it runs in the caller's transaction,
 * and the unique index on the lot guarantees one purchase is never expensed twice.
 */
export async function createExpense(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  input: ExpenseInput,
  options: {
    session?: ClientSession;
    stock?: { itemId: Types.ObjectId; lotId: Types.ObjectId }[];
  } = {},
): Promise<Types.ObjectId> {
  await assertUsableCategory(companyId, input.categoryId, options.session);
  const paid = checkPayments(input.amount.amount, input.payments);
  const [expense] = await ExpenseModel.create(
    [
      {
        companyId,
        description: input.description,
        categoryId: new Types.ObjectId(input.categoryId),
        amount: input.amount,
        paid,
        status: statusOf(input.amount.amount, paid, false),
        purchasedAt: input.purchasedAt,
        vendor: input.vendor,
        dueDate: input.dueDate,
        notes: input.notes,
        payments: input.payments.map((p) => ({ ...p, createdBy: actorId })),
        stock: options.stock ?? [],
        createdBy: actorId,
      },
    ],
    { session: options.session },
  );
  if (!expense) throw new Error('Expense was not created');
  await audit(
    { companyId, actorId, action: 'expense.created', entity: 'expense', entityId: expense._id },
    options.session,
  );
  return expense._id;
}

export async function updateExpense(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
  input: z.output<typeof updateExpenseSchema>,
): Promise<ExpenseView> {
  const current = await ExpenseModel.findOne({ _id: id, companyId }).lean();
  if (!current) throw new NotFoundError('Expense');
  if (current.cancelledAt)
    throw new AppError(409, 'EXPENSE_CANCELLED', 'A cancelled expense cannot be edited');
  if (input.categoryId) await assertUsableCategory(companyId, input.categoryId);

  const amount = input.amount ?? (current.amount as Money);
  if (
    input.amount &&
    current.payments.length > 0 &&
    input.amount.currency !== current.amount.currency
  ) {
    throw new ValidationError('Some fields are invalid', [
      { path: 'amount.currency', message: 'Remove the payments before changing the currency' },
    ]);
  }
  if (amount.amount < current.paid) {
    throw new ValidationError('Some fields are invalid', [
      { path: 'amount.amount', message: 'The amount cannot be less than what was already paid' },
    ]);
  }

  const result = await ExpenseModel.updateOne(
    { _id: id, companyId, paid: current.paid },
    {
      $set: {
        ...input,
        ...(input.categoryId && { categoryId: new Types.ObjectId(input.categoryId) }),
        status: statusOf(amount.amount, current.paid, false),
      },
    },
    { runValidators: true },
  );
  if (result.matchedCount !== 1)
    throw new AppError(409, 'EXPENSE_CHANGED', 'The expense changed meanwhile. Reload it.');
  await audit({
    companyId,
    actorId,
    action: 'expense.updated',
    entity: 'expense',
    entityId: id,
    changes: input,
  });
  return getExpense(companyId, id);
}

/**
 * Adds a payment atomically: the database only accepts it while the total stays within
 * the amount, and a repeated idempotency key is ignored (a double click pays once).
 */
export async function addPayment(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
  input: PaymentInput,
  opKey: string,
): Promise<ExpenseView> {
  const payment = { _id: new Types.ObjectId(), ...input, opKey, createdBy: actorId };
  const result = await ExpenseModel.updateOne(
    {
      _id: id,
      companyId,
      cancelledAt: null,
      'payments.opKey': { $ne: opKey },
      $expr: { $lte: [{ $add: ['$paid', input.amount] }, '$amount.amount'] },
    },
    [
      {
        $set: {
          payments: { $concatArrays: ['$payments', [payment]] },
          paid: { $add: ['$paid', input.amount] },
        },
      },
      {
        $set: {
          status: {
            $cond: [
              { $gte: ['$paid', '$amount.amount'] },
              'paid',
              { $cond: [{ $gt: ['$paid', 0] }, 'partial', 'pending'] },
            ],
          },
        },
      },
    ],
    { updatePipeline: true },
  );

  if (result.matchedCount !== 1) {
    const current = await ExpenseModel.findOne({ _id: id, companyId }).lean();
    if (!current) throw new NotFoundError('Expense');
    if (current.payments.some((p) => p.opKey === opKey)) return getExpense(companyId, id);
    if (current.cancelledAt)
      throw new AppError(409, 'EXPENSE_CANCELLED', 'A cancelled expense cannot take payments');
    throw new ValidationError('Some fields are invalid', [
      { path: 'amount', message: 'This payment is more than what is still owed' },
    ]);
  }
  await audit({
    companyId,
    actorId,
    action: 'expense.payment_added',
    entity: 'expense',
    entityId: id,
    changes: { amount: input.amount },
  });
  return getExpense(companyId, id);
}

/** Removes a payment recorded by mistake. The audit log keeps what was removed. */
export async function removePayment(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
  paymentId: Types.ObjectId,
): Promise<ExpenseView> {
  const current = await ExpenseModel.findOne({
    _id: id,
    companyId,
    'payments._id': paymentId,
  }).lean();
  const payment = current?.payments.find((p) => p._id.equals(paymentId));
  if (!current || !payment) throw new NotFoundError('Payment');
  const paid = current.paid - payment.amount;
  await ExpenseModel.updateOne(
    { _id: id, companyId, paid: current.paid },
    {
      $pull: { payments: { _id: paymentId } },
      $set: { paid, status: statusOf(current.amount.amount, paid, Boolean(current.cancelledAt)) },
    },
  );
  await audit({
    companyId,
    actorId,
    action: 'expense.payment_removed',
    entity: 'expense',
    entityId: id,
    changes: { amount: payment.amount, paidAt: payment.paidAt.toISOString() },
  });
  return getExpense(companyId, id);
}

/** Cancelling keeps the record and its payments; it only drops out of the totals. */
export async function cancelExpense(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
  reason: string,
): Promise<ExpenseView> {
  const result = await ExpenseModel.updateOne(
    { _id: id, companyId, cancelledAt: null },
    { $set: { cancelledAt: new Date(), cancelReason: reason, status: 'cancelled' } },
  );
  if (result.matchedCount !== 1) {
    if (!(await ExpenseModel.exists({ _id: id, companyId }))) throw new NotFoundError('Expense');
    throw new AppError(409, 'EXPENSE_CANCELLED', 'This expense is already cancelled');
  }
  await audit({
    companyId,
    actorId,
    action: 'expense.cancelled',
    entity: 'expense',
    entityId: id,
    reason,
  });
  return getExpense(companyId, id);
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listExpenses(
  companyId: Types.ObjectId,
  filters: z.output<typeof expenseFiltersSchema>,
): Promise<ExpenseView[]> {
  const query: Record<string, unknown> = { companyId };
  if (filters.from || filters.to) {
    query.purchasedAt = {
      ...(filters.from && { $gte: filters.from }),
      ...(filters.to && { $lte: filters.to }),
    };
  }
  if (filters.categoryId) query.categoryId = new Types.ObjectId(filters.categoryId);
  if (filters.status) query.status = filters.status;
  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), 'i');
    query.$or = [{ description: pattern }, { vendor: pattern }];
  }
  const rows = await ExpenseModel.find(query).sort({ purchasedAt: -1, _id: -1 }).limit(500).lean();
  return toViews(companyId, rows as ExpenseRecord[]);
}

type Totals = { _id: Currency; amount: number }[];
const toMoney = (rows: Totals): Money[] =>
  rows.filter((r) => r.amount !== 0).map((r) => ({ amount: r.amount, currency: r._id }));

/**
 * Period totals, never mixing currencies:
 * recorded = purchases dated in the period; paid = payments made in the period
 * (actual cash out, whatever the purchase date); pending = still owed on the period's purchases.
 * Cancelled expenses are left out of all three.
 */
export async function expenseSummary(
  companyId: Types.ObjectId,
  from: Date | undefined,
  to: Date | undefined,
  defaultCurrency: Currency,
): Promise<ExpenseSummaryView> {
  const range = (field: string) =>
    from || to ? { [field]: { ...(from && { $gte: from }), ...(to && { $lte: to }) } } : {};
  const active = { companyId, cancelledAt: null };

  const [recorded, pending, paid, byCategory] = await Promise.all([
    ExpenseModel.aggregate<Totals[number]>([
      { $match: { ...active, ...range('purchasedAt') } },
      { $group: { _id: '$amount.currency', amount: { $sum: '$amount.amount' } } },
    ]),
    ExpenseModel.aggregate<Totals[number]>([
      { $match: { ...active, ...range('purchasedAt') } },
      {
        $group: {
          _id: '$amount.currency',
          amount: { $sum: { $subtract: ['$amount.amount', '$paid'] } },
        },
      },
    ]),
    ExpenseModel.aggregate<Totals[number]>([
      { $match: { ...active, ...range('payments.paidAt') } },
      { $unwind: '$payments' },
      { $match: range('payments.paidAt') },
      { $group: { _id: '$amount.currency', amount: { $sum: '$payments.amount' } } },
    ]),
    ExpenseModel.aggregate<{ _id: Types.ObjectId; amount: number }>([
      { $match: { ...active, ...range('purchasedAt'), 'amount.currency': defaultCurrency } },
      { $group: { _id: '$categoryId', amount: { $sum: '$amount.amount' } } },
      { $sort: { amount: -1 } },
      { $limit: 1 },
    ]),
  ]);

  const top = byCategory[0];
  const names = top ? await categories(companyId) : new Map();
  return {
    recorded: toMoney(recorded),
    paid: toMoney(paid),
    pending: toMoney(pending),
    topCategory: top
      ? {
          name: names.get(top._id.toString())?.name ?? 'Unknown',
          amount: { amount: top.amount, currency: defaultCurrency },
        }
      : null,
  };
}

/**
 * Deletes an expense entered by mistake, with its payments. Rolls it paid for stay in stock,
 * unlinked, and show again under "not recorded in expenses". A real expense that was called
 * off is cancelled instead, so it stays in the history.
 */
export async function deleteExpense(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
): Promise<void> {
  await mongoose.connection.transaction(async (session) => {
    const expense = await ExpenseModel.findOneAndDelete(
      { _id: id, companyId },
      { session, projection: { description: 1 } },
    ).lean();
    if (!expense) throw new NotFoundError('Expense');
    await InventoryItemModel.updateMany(
      { companyId, 'lots.expenseId': id },
      { $set: { 'lots.$[lot].expenseId': null } },
      { session, arrayFilters: [{ 'lot.expenseId': id }] },
    );
    await audit(
      {
        companyId,
        actorId,
        action: 'expense.deleted',
        entity: 'expense',
        entityId: id,
        reason: expense.description,
      },
      session,
    );
  });
}
