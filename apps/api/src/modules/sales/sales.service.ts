import {
  divide,
  multiply,
  paymentOf,
  productionFromOrder,
  quoteCode,
  roundToCents,
  saleCode,
  saleProfit,
  saleTotals,
  sum,
  toDecimalString,
  toMicro,
  type BreakdownRow,
  type CalcResult,
  type Currency,
  type Money,
  type OrderStatus,
  type PaymentMethod,
  type SaleCustomerKind,
  type SaleDraftView,
  type SaleListItemView,
  type SaleListView,
  type SaleProduction,
  type SaleView,
  type saleCancelSchema,
  type saleDraftQuerySchema,
  type saleFiltersSchema,
  type saleInputSchema,
  type saleReceiptSchema,
  type orderConsumptionSchema,
  type OrderMovementView,
} from '@printbi/shared';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import { isDuplicateKey } from '../../core/http/idempotency';
import { CalculationModel } from '../calculations/calculation.model';
import { CompanyModel } from '../companies/company.model';
import { CustomerModel } from '../customers/customer.model';
import { InventoryItemModel, StockMovementModel } from '../inventory/inventory.model';
import { movementViews, recordConsumption } from '../inventory/inventory.service';
import { syncOrderWithSale } from '../orders/order-links';
import { OrderModel } from '../orders/order.model';
import { ProductModel } from '../products/product.model';
import { QuoteModel } from '../quotes/quote.model';
import { UserModel } from '../users/user.model';
import { SaleModel } from './sale.model';

type SaleInput = z.output<typeof saleInputSchema>;
type SaleFilters = z.output<typeof saleFiltersSchema>;
type ReceiptInput = z.output<typeof saleReceiptSchema>;

export interface SaleActor {
  companyId: Types.ObjectId;
  userId: Types.ObjectId;
}

interface CostSummary {
  materials: Money[];
  losses: Money[];
  unpricedLines?: number | null;
  lines?: number | null;
}

interface SaleRecord {
  _id: Types.ObjectId;
  number: number;
  saleDate: string;
  customer: { kind: SaleCustomerKind; customerId?: Types.ObjectId | null; name?: string | null };
  sourceId?: Types.ObjectId | null;
  currency: Currency;
  lines: {
    productId?: Types.ObjectId | null;
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    amount: number;
    estimatedCost?: number | null;
    labels: { id: Types.ObjectId; name: string }[];
  }[];
  subtotal: number;
  discount: number;
  delivery: number;
  total: number;
  costs: { label: string; amount: number }[];
  receipts: {
    _id: Types.ObjectId;
    amount: number;
    receivedAt: string;
    method: PaymentMethod;
    note?: string | null;
    by: Types.ObjectId;
  }[];
  received: number;
  production: SaleProduction;
  notes?: string | null;
  quoteId?: Types.ObjectId | null;
  orderId?: Types.ObjectId | null;
  brlPerCad?: number | null;
  costSummary?: CostSummary | null;
  cancelledAt?: Date | null;
  cancelReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const invalid = (path: string, message: string) =>
  new ValidationError('Some fields are invalid', [{ path, message }]);

async function load(actor: SaleActor, id: Types.ObjectId): Promise<SaleRecord> {
  const row = (await SaleModel.findOne({
    _id: id,
    companyId: actor.companyId,
  }).lean()) as unknown as SaleRecord | null;
  if (!row) throw new NotFoundError('Sale');
  return row;
}

async function companySettings(companyId: Types.ObjectId) {
  const company = await CompanyModel.findById(companyId, {
    'settings.currency': 1,
    labels: 1,
    customerSources: 1,
  }).lean();
  if (!company) throw new NotFoundError('Company');
  return {
    brlPerCad: company.settings?.currency?.brlPerCad ?? null,
    defaultCurrency: (company.settings?.currency?.defaultCurrency ?? 'CAD') as Currency,
    labels: new Map((company.labels ?? []).map((l) => [l._id.toString(), l.name])),
    sources: new Map((company.customerSources ?? []).map((s) => [s._id.toString(), s.name])),
  };
}

// ---------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------

interface ViewContext {
  customers: Map<string, string>;
  orders: Map<string, { title: string; status: OrderStatus; costSummary?: CostSummary | null }>;
  quotes: Map<string, string>;
  sources: Map<string, string>;
  users: Map<string, string>;
}

async function viewContext(
  companyId: Types.ObjectId,
  rows: SaleRecord[],
  withUsers = false,
): Promise<ViewContext> {
  const ids = (pick: (r: SaleRecord) => (Types.ObjectId | null | undefined)[]) => [
    ...new Set(rows.flatMap((r) => pick(r).flatMap((id) => (id ? [id.toString()] : [])))),
  ];
  const [customers, orders, quotes, company, users] = await Promise.all([
    CustomerModel.find(
      { companyId, _id: { $in: ids((r) => [r.customer.customerId]) } },
      { name: 1 },
    ).lean(),
    OrderModel.find(
      { companyId, _id: { $in: ids((r) => [r.orderId]) } },
      { title: 1, status: 1, costSummary: 1 },
    ).lean(),
    QuoteModel.find({ companyId, _id: { $in: ids((r) => [r.quoteId]) } }, { number: 1 }).lean(),
    CompanyModel.findById(companyId, { customerSources: 1 }).lean(),
    withUsers
      ? UserModel.find(
          { _id: { $in: ids((r) => r.receipts.map((x) => x.by)) } },
          { firstName: 1, lastName: 1 },
        ).lean()
      : [],
  ]);
  return {
    customers: new Map(customers.map((c) => [c._id.toString(), c.name])),
    orders: new Map(
      orders.map((o) => [
        o._id.toString(),
        {
          title: o.title,
          status: o.status as OrderStatus,
          costSummary: o.costSummary as CostSummary | undefined,
        },
      ]),
    ),
    quotes: new Map(quotes.map((q) => [q._id.toString(), quoteCode(q.number)])),
    sources: new Map((company?.customerSources ?? []).map((s) => [s._id.toString(), s.name])),
    users: new Map(users.map((u) => [u._id.toString(), `${u.firstName} ${u.lastName}`.trim()])),
  };
}

/** Stock used for the sale: through its order when it has one, else recorded on the sale. */
function recordedOf(row: SaleRecord, ctx: ViewContext) {
  const summary = row.orderId
    ? ctx.orders.get(row.orderId.toString())?.costSummary
    : row.costSummary;
  return {
    materials: (summary?.materials ?? []).map((m) => ({ amount: m.amount, currency: m.currency })),
    losses: (summary?.losses ?? []).map((m) => ({ amount: m.amount, currency: m.currency })),
    unpricedLines: summary?.unpricedLines ?? 0,
    lines: summary?.lines ?? 0,
  };
}

const quantityText = (micro: number) => toDecimalString(micro).replace(/\.?0+$/, '');

function listItem(row: SaleRecord, ctx: ViewContext): SaleListItemView {
  const customerId = row.customer.customerId?.toString() ?? null;
  const order = row.orderId ? ctx.orders.get(row.orderId.toString()) : undefined;
  const recorded = recordedOf(row, ctx);
  const estimates = row.lines.map((l) => l.estimatedCost ?? null);
  const cancelled = Boolean(row.cancelledAt);
  return {
    id: row._id.toString(),
    code: saleCode(row.number),
    saleDate: row.saleDate,
    customer: {
      kind: row.customer.kind,
      customerId,
      name:
        row.customer.kind === 'unknown'
          ? ''
          : ((customerId && ctx.customers.get(customerId)) ?? row.customer.name ?? ''),
    },
    currency: row.currency,
    items: row.lines.map((l) => `${l.description} ×${quantityText(l.quantity)}`).join(', '),
    total: row.total,
    received: row.received,
    outstanding: Math.max(0, row.total - row.received),
    payment: paymentOf(row.total, row.received),
    production: cancelled
      ? 'cancelled'
      : order
        ? productionFromOrder(order.status)
        : row.production,
    profit: saleProfit({
      total: row.total,
      currency: row.currency,
      recorded: [...recorded.materials, ...recorded.losses],
      recordedLines: recorded.lines,
      estimated: estimates.some((e) => e !== null) ? sum(estimates.map((e) => e ?? 0)) : null,
      extras: sum(row.costs.map((c) => c.amount)),
      brlPerCad: row.brlPerCad ?? null,
    }),
    cancelled,
    order: row.orderId && order ? { id: row.orderId.toString(), title: order.title } : null,
    quote: row.quoteId
      ? { id: row.quoteId.toString(), code: ctx.quotes.get(row.quoteId.toString()) ?? '' }
      : null,
  };
}

function fullView(row: SaleRecord, ctx: ViewContext): SaleView {
  const estimates = row.lines.map((l) => l.estimatedCost ?? null);
  return {
    ...listItem(row, ctx),
    lines: row.lines.map((l) => ({
      productId: l.productId?.toString() ?? null,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount,
      amount: l.amount,
      estimatedCost: l.estimatedCost ?? null,
      labels: l.labels.map((x) => ({ id: x.id.toString(), name: x.name })),
    })),
    subtotal: row.subtotal,
    discount: row.discount,
    delivery: row.delivery,
    costs: row.costs.map((c) => ({ label: c.label, amount: c.amount })),
    receipts: row.receipts.map((r) => ({
      id: r._id.toString(),
      amount: r.amount,
      receivedAt: r.receivedAt,
      method: r.method,
      note: r.note ?? '',
      by: ctx.users.get(r.by.toString()) ?? 'Former member',
    })),
    notes: row.notes ?? '',
    source: row.sourceId
      ? { id: row.sourceId.toString(), name: ctx.sources.get(row.sourceId.toString()) ?? '' }
      : null,
    manualProduction: row.production,
    brlPerCad: row.brlPerCad ?? null,
    recorded: recordedOf(row, ctx),
    estimatedCost: estimates.some((e) => e !== null) ? sum(estimates.map((e) => e ?? 0)) : null,
    cancelReason: row.cancelReason ?? '',
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getSale(actor: SaleActor, id: Types.ObjectId): Promise<SaleView> {
  const row = await load(actor, id);
  return fullView(row, await viewContext(actor.companyId, [row], true));
}

// ---------------------------------------------------------------------------------------------
// Create and edit
// ---------------------------------------------------------------------------------------------

/** The stored fields from the form, every reference checked against this company. */
async function build(actor: SaleActor, input: SaleInput) {
  const settings = await companySettings(actor.companyId);
  let customer: { kind: SaleCustomerKind; customerId: Types.ObjectId | null; name: string } = {
    kind: input.customer.kind,
    customerId: null,
    name: input.customer.kind === 'name' ? input.customer.name : '',
  };
  if (input.customer.kind === 'customer') {
    const found = await CustomerModel.findOne(
      { _id: input.customer.customerId, companyId: actor.companyId },
      { name: 1 },
    ).lean();
    if (!found) throw invalid('customer.customerId', 'Customer not found');
    customer = { kind: 'customer', customerId: found._id, name: found.name };
  }
  if (input.sourceId && !settings.sources.has(input.sourceId)) {
    throw invalid('sourceId', 'Source not found');
  }

  const productIds = [...new Set(input.lines.flatMap((l) => (l.productId ? [l.productId] : [])))];
  const products = productIds.length
    ? await ProductModel.find(
        { companyId: actor.companyId, _id: { $in: productIds } },
        { labelIds: 1 },
      ).lean()
    : [];
  if (products.length !== productIds.length) throw invalid('lines', 'Product not found');
  const labelsOf = new Map(
    products.map((p) => [
      p._id.toString(),
      ((p.labelIds ?? []) as Types.ObjectId[]).flatMap((id) => {
        const name = settings.labels.get(id.toString());
        return name ? [{ id, name }] : [];
      }),
    ]),
  );

  const totals = saleTotals({
    lines: input.lines,
    discount: input.discount,
    delivery: input.delivery,
  });
  return {
    fields: {
      saleDate: input.saleDate,
      customer,
      sourceId: input.sourceId ? new Types.ObjectId(input.sourceId) : null,
      currency: input.currency,
      lines: input.lines.map((l, i) => ({
        productId: l.productId ? new Types.ObjectId(l.productId) : null,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: roundToCents(l.discount),
        amount: totals.lines[i]!,
        estimatedCost: l.estimatedCost === null ? null : roundToCents(l.estimatedCost),
        labels: l.productId ? (labelsOf.get(l.productId) ?? []) : [],
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      delivery: totals.delivery,
      total: totals.total,
      costs: input.costs.map((c) => ({ label: c.label, amount: roundToCents(c.amount) })),
      production: input.production,
      notes: input.notes,
    },
    brlPerCad: settings.brlPerCad,
  };
}

const SALE_EXISTS = (saleId: string) =>
  new AppError(409, 'SALE_EXISTS', 'A sale was already registered for this', { saleId });

/** Checks the order and quote a new sale comes from; each one makes a single sale. */
async function checkSources(actor: SaleActor, input: SaleInput) {
  if (input.orderId) {
    const order = await OrderModel.findOne(
      { _id: input.orderId, companyId: actor.companyId },
      { type: 1, saleId: 1 },
    ).lean();
    if (!order) throw invalid('orderId', 'Order not found');
    if (order.type !== 'sale') {
      throw new AppError(409, 'NOT_A_SALE', 'Gifts and personal jobs have no sale');
    }
    if (order.saleId) throw SALE_EXISTS(order.saleId.toString());
  }
  if (input.quoteId) {
    const quote = await QuoteModel.findOne(
      { _id: input.quoteId, companyId: actor.companyId },
      { status: 1 },
    ).lean();
    if (!quote) throw invalid('quoteId', 'Quote not found');
    if (quote.status !== 'approved') {
      throw new AppError(
        409,
        'QUOTE_NOT_APPROVED',
        'Approve the quote before registering its sale',
      );
    }
    const existing = await SaleModel.findOne(
      { companyId: actor.companyId, quoteId: input.quoteId },
      { _id: 1 },
    ).lean();
    if (existing) throw SALE_EXISTS(existing._id.toString());
  }
}

const receiptsOf = (actor: SaleActor, receipts: ReceiptInput[]) =>
  receipts.map((r) => ({
    amount: roundToCents(r.amount),
    receivedAt: r.receivedAt,
    method: r.method,
    note: r.note,
    by: actor.userId,
  }));

/** Saves the order's side of the link: its payment and agreed price follow the sale. */
async function syncOrder(actor: SaleActor, row: SaleRecord) {
  if (!row.orderId || row.cancelledAt) return;
  await syncOrderWithSale(actor.companyId, row.orderId, {
    id: row._id,
    payment: paymentOf(row.total, row.received),
    total: { amount: row.total, currency: row.currency },
  });
}

/** Registering a sale never deducts stock: stock use is recorded on its order (or on it). */
export async function createSale(actor: SaleActor, input: SaleInput): Promise<SaleView> {
  const { fields, brlPerCad } = await build(actor, input);
  await checkSources(actor, input);
  const receipts = receiptsOf(actor, input.receipts);
  // One atomic step hands out the next number, so two sales can never share one.
  const company = await CompanyModel.findOneAndUpdate(
    { _id: actor.companyId },
    { $inc: { 'counters.sale': 1 } },
    { returnDocument: 'after', projection: { counters: 1 } },
  ).lean();
  if (!company) throw new NotFoundError('Company');
  let created: { _id: Types.ObjectId };
  try {
    created = await SaleModel.create({
      ...fields,
      companyId: actor.companyId,
      number: company.counters?.sale ?? 1,
      receipts,
      received: sum(receipts.map((r) => r.amount)),
      quoteId: input.quoteId ? new Types.ObjectId(input.quoteId) : null,
      orderId: input.orderId ? new Types.ObjectId(input.orderId) : null,
      brlPerCad: brlPerCad ?? undefined,
      createdBy: actor.userId,
    });
  } catch (error) {
    // Two clicks at once: the unique indexes let only one sale per order and quote through.
    if (isDuplicateKey(error)) {
      const existing = await SaleModel.findOne(
        {
          companyId: actor.companyId,
          $or: [
            ...(input.orderId ? [{ orderId: new Types.ObjectId(input.orderId) }] : []),
            ...(input.quoteId ? [{ quoteId: new Types.ObjectId(input.quoteId) }] : []),
          ],
        },
        { _id: 1 },
      ).lean();
      throw SALE_EXISTS(existing?._id.toString() ?? '');
    }
    throw error;
  }
  const row = await load(actor, created._id);
  await syncOrder(actor, row);
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'sale.created',
    entity: 'sale',
    entityId: created._id,
  });
  return getSale(actor, created._id);
}

const CANCELLED = () =>
  new AppError(409, 'SALE_CANCELLED', 'This sale was cancelled; it keeps its history as it is.');

/** Edits the sale. Receipts change through their own actions; the links never change. */
export async function updateSale(
  actor: SaleActor,
  id: Types.ObjectId,
  input: SaleInput,
): Promise<SaleView> {
  const current = await load(actor, id);
  if (current.cancelledAt) throw CANCELLED();
  const { fields, brlPerCad } = await build(actor, input);
  await SaleModel.updateOne(
    { _id: id, companyId: actor.companyId },
    // A rate missing when the sale was made is filled in once the business sets one.
    { $set: { ...fields, ...((current.brlPerCad ?? null) === null && { brlPerCad }) } },
  );
  await syncOrder(actor, await load(actor, id));
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'sale.updated',
    entity: 'sale',
    entityId: id,
  });
  return getSale(actor, id);
}

// ---------------------------------------------------------------------------------------------
// Receipts, cancelling and deleting
// ---------------------------------------------------------------------------------------------

async function storeReceipts(
  actor: SaleActor,
  id: Types.ObjectId,
  receipts: SaleRecord['receipts'],
) {
  await SaleModel.updateOne(
    { _id: id, companyId: actor.companyId },
    { $set: { receipts, received: sum(receipts.map((r) => r.amount)) } },
  );
  await syncOrder(actor, await load(actor, id));
}

/** Money received for the sale: partial payments add up until it is paid. */
export async function addReceipt(
  actor: SaleActor,
  id: Types.ObjectId,
  input: ReceiptInput,
): Promise<SaleView> {
  const current = await load(actor, id);
  if (current.cancelledAt) throw CANCELLED();
  const [receipt] = receiptsOf(actor, [input]);
  await storeReceipts(actor, id, [...current.receipts, { ...receipt!, _id: new Types.ObjectId() }]);
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'sale.receipt_added',
    entity: 'sale',
    entityId: id,
    reason: toDecimalString(receipt!.amount),
  });
  return getSale(actor, id);
}

/** Removes a receipt recorded by mistake; the audit log keeps it. */
export async function removeReceipt(
  actor: SaleActor,
  id: Types.ObjectId,
  receiptId: Types.ObjectId,
): Promise<SaleView> {
  const current = await load(actor, id);
  const receipt = current.receipts.find((r) => r._id.equals(receiptId));
  if (!receipt) throw new NotFoundError('Receipt');
  await storeReceipts(
    actor,
    id,
    current.receipts.filter((r) => !r._id.equals(receiptId)),
  );
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'sale.receipt_removed',
    entity: 'sale',
    entityId: id,
    reason: `${toDecimalString(receipt.amount)} on ${receipt.receivedAt}`,
  });
  return getSale(actor, id);
}

/**
 * Cancels a sale that was called off. It stays on record and leaves the totals; stock already
 * used and money already received are not reversed: refunds are handled on their own.
 */
export async function cancelSale(
  actor: SaleActor,
  id: Types.ObjectId,
  input: z.output<typeof saleCancelSchema>,
): Promise<SaleView> {
  const current = await load(actor, id);
  if (current.cancelledAt) throw CANCELLED();
  await SaleModel.updateOne(
    { _id: id, companyId: actor.companyId },
    { $set: { cancelledAt: new Date(), cancelReason: input.reason } },
  );
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'sale.cancelled',
    entity: 'sale',
    entityId: id,
    reason: input.reason,
  });
  return getSale(actor, id);
}

/**
 * Deletes a sale entered by mistake, with its receipts. One that recorded stock use is real
 * history, so it is cancelled instead. Its order keeps going, with its payment set by hand again.
 */
export async function deleteSale(actor: SaleActor, id: Types.ObjectId): Promise<void> {
  const current = await load(actor, id);
  if (await StockMovementModel.exists({ companyId: actor.companyId, saleId: id })) {
    throw new ConflictError('This sale recorded stock use. Cancel it instead: its history stays.');
  }
  await SaleModel.deleteOne({ _id: id, companyId: actor.companyId });
  if (current.orderId) await syncOrderWithSale(actor.companyId, current.orderId, null);
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'sale.deleted',
    entity: 'sale',
    entityId: id,
    reason: saleCode(current.number),
  });
}

// ---------------------------------------------------------------------------------------------
// Stock used by a sale without an order
// ---------------------------------------------------------------------------------------------

export async function recordSaleUsage(
  actor: SaleActor & { canSeeFinance: boolean; canManageFinance: boolean },
  id: Types.ObjectId,
  input: z.output<typeof orderConsumptionSchema>,
  key: string,
) {
  await load(actor, id);
  return recordConsumption(
    {
      companyId: actor.companyId,
      userId: actor.userId,
      canSeeFinance: actor.canSeeFinance,
      canManageFinance: actor.canManageFinance,
    },
    { ...input, orderId: null, saleId: id.toString() },
    key,
  );
}

/** Stock lines of the sale: its order's when it has one, else its own. */
export async function listSaleMovements(
  actor: SaleActor,
  id: Types.ObjectId,
): Promise<OrderMovementView[]> {
  const sale = await load(actor, id);
  const rows = await StockMovementModel.find({
    companyId: actor.companyId,
    ...(sale.orderId ? { orderId: sale.orderId } : { saleId: id }),
    delta: { $ne: 0 },
  })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  const [views, items] = await Promise.all([
    movementViews(actor.companyId, rows, true),
    InventoryItemModel.find(
      { companyId: actor.companyId, _id: { $in: [...new Set(rows.map((r) => r.itemId))] } },
      { name: 1, unit: 1, customUnit: 1 },
    ).lean(),
  ]);
  const byId = new Map(items.map((i) => [i._id.toString(), i]));
  return views.map((v) => {
    const item = byId.get(v.itemId);
    return {
      ...v,
      itemName: item?.name ?? 'Deleted item',
      unit: (item?.unit ?? 'unit') as OrderMovementView['unit'],
      customUnit: item?.customUnit ?? '',
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Drafts: a new sale prefilled from an order, a quote or a calculation
// ---------------------------------------------------------------------------------------------

const ONE = toMicro('1');

export async function draftSale(
  actor: SaleActor,
  query: z.output<typeof saleDraftQuerySchema>,
): Promise<SaleDraftView> {
  const settings = await companySettings(actor.companyId);
  const draft: SaleDraftView['draft'] = {
    customer: { kind: 'unknown', customerId: null, name: '' },
    currency: settings.defaultCurrency,
    lines: [],
    discount: 0,
    delivery: 0,
    quoteId: null,
    orderId: null,
  };
  const existing = async (filter: Record<string, unknown>) =>
    (
      await SaleModel.findOne({ companyId: actor.companyId, ...filter }, { _id: 1 }).lean()
    )?._id.toString() ?? null;
  const customerOf = async (customerId: Types.ObjectId | null | undefined, name: string) => {
    const found =
      customerId &&
      (await CustomerModel.findOne(
        { _id: customerId, companyId: actor.companyId },
        { name: 1 },
      ).lean());
    return found
      ? { kind: 'customer' as const, customerId: found._id.toString(), name: found.name }
      : name
        ? { kind: 'name' as const, customerId: null, name }
        : { kind: 'unknown' as const, customerId: null, name: '' };
  };

  if (query.orderId) {
    const order = await OrderModel.findOne({
      _id: query.orderId,
      companyId: actor.companyId,
    }).lean();
    if (!order) throw new NotFoundError('Order');
    const quantity = toMicro(String(order.quantity));
    const price = order.agreedPrice?.amount ?? 0;
    draft.customer =
      order.recipient?.kind === 'myself'
        ? draft.customer
        : await customerOf(order.recipient?.customerId, order.recipient?.name ?? '');
    draft.currency = (order.agreedPrice?.currency as Currency) ?? settings.defaultCurrency;
    draft.lines = [
      {
        productId: order.productId?.toString() ?? null,
        description: order.title,
        quantity,
        unitPrice: price ? roundToCents(divide(price, quantity)) : 0,
        discount: 0,
        estimatedCost: order.estimatedCost?.amount ?? null,
      },
    ];
    draft.orderId = order._id.toString();
    if (order.quoteId && !(await existing({ quoteId: order.quoteId }))) {
      draft.quoteId = order.quoteId.toString();
    }
    return {
      from: { kind: 'order', id: order._id.toString(), label: order.title },
      existingSaleId: order.saleId?.toString() ?? null,
      draft,
    };
  }

  if (query.quoteId) {
    const quote = await QuoteModel.findOne({
      _id: query.quoteId,
      companyId: actor.companyId,
    }).lean();
    if (!quote) throw new NotFoundError('Quote');
    draft.customer = await customerOf(quote.customerId, quote.customer?.name ?? '');
    draft.currency = quote.currency as Currency;
    draft.lines = quote.lines.map((l) => {
      const rows = (l.breakdown ?? null) as BreakdownRow[] | null;
      const covered = l.breakdownQuantity ?? null;
      const cost =
        rows && covered
          ? roundToCents(multiply(sum(rows.map((r) => r.amount)), divide(l.quantity, covered)))
          : null;
      return {
        productId: l.productId?.toString() ?? null,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        estimatedCost: cost,
      };
    });
    // Taxes become their own lines, so the sale adds up to what the customer accepted.
    for (const tax of quote.taxes ?? []) {
      if (tax.amount) {
        draft.lines.push({
          productId: null,
          description: tax.label ?? 'Tax',
          quantity: ONE,
          unitPrice: tax.amount,
          discount: 0,
          estimatedCost: null,
        });
      }
    }
    draft.discount = quote.discount;
    draft.delivery = quote.delivery;
    draft.quoteId = quote._id.toString();
    const order = await OrderModel.findOne(
      { companyId: actor.companyId, quoteId: quote._id },
      { saleId: 1 },
    ).lean();
    if (order && !order.saleId) draft.orderId = order._id.toString();
    return {
      from: { kind: 'quote', id: quote._id.toString(), label: quoteCode(quote.number) },
      existingSaleId: await existing({ quoteId: quote._id }),
      draft,
    };
  }

  if (query.calculationId) {
    const calc = await CalculationModel.findOne(
      { _id: query.calculationId, companyId: actor.companyId },
      { name: 1, currency: 1, quantity: 1, result: 1 },
    ).lean();
    if (!calc) throw new NotFoundError('Calculation');
    const result = calc.result as CalcResult;
    draft.currency = calc.currency as Currency;
    draft.lines = [
      {
        productId: null,
        description: calc.name,
        quantity: toMicro(String(calc.quantity)),
        unitPrice: result.price?.unit ?? 0,
        discount: 0,
        estimatedCost: result.batchCost,
      },
    ];
    return {
      from: { kind: 'calculation', id: calc._id.toString(), label: calc.name },
      existingSaleId: null,
      draft,
    };
  }

  if (query.customerId) {
    draft.customer = await customerOf(new Types.ObjectId(query.customerId), '');
    return {
      from: { kind: 'customer', id: query.customerId, label: draft.customer.name },
      existingSaleId: null,
      draft,
    };
  }
  return { from: null, existingSaleId: null, draft };
}

// ---------------------------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------------------------

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function perCurrency(entries: { currency: Currency; amount: number }[]): Money[] {
  const totals = new Map<Currency, number>();
  for (const e of entries) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amount);
  return [...totals].map(([currency, amount]) => ({ currency, amount }));
}

export async function listSales(actor: SaleActor, filters: SaleFilters): Promise<SaleListView> {
  const query: Record<string, unknown> = { companyId: actor.companyId };
  const date: Record<string, string> = {};
  if (filters.from) date.$gte = filters.from;
  if (filters.to) date.$lte = filters.to;
  if (Object.keys(date).length) query.saleDate = date;
  if (filters.customerId) query['customer.customerId'] = new Types.ObjectId(filters.customerId);
  if (filters.productId) query['lines.productId'] = new Types.ObjectId(filters.productId);
  if (filters.cancelled === true) query.cancelledAt = { $ne: null };
  if (filters.cancelled === false) query.cancelledAt = null;
  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), 'i');
    const number = Number(/(\d+)\s*$/.exec(filters.q)?.[1]);
    query.$or = [
      { 'customer.name': pattern },
      { 'lines.description': pattern },
      { notes: pattern },
      ...(Number.isSafeInteger(number) && number > 0 ? [{ number }] : []),
    ];
  }
  const rows = (await SaleModel.find(query)
    .sort({ saleDate: -1, number: -1 })
    .limit(500)
    .lean()) as unknown as SaleRecord[];
  const ctx = await viewContext(actor.companyId, rows);
  let sales = rows.map((r) => listItem(r, ctx));
  if (filters.payment) sales = sales.filter((s) => s.payment === filters.payment);
  if (filters.production) sales = sales.filter((s) => s.production === filters.production);
  if (filters.estimated !== undefined) {
    sales = sales.filter((s) => (s.profit.basis !== 'recorded') === filters.estimated);
  }

  const live = sales.filter((s) => !s.cancelled);
  return {
    sales,
    summary: {
      count: live.length,
      sold: perCurrency(live.map((s) => ({ currency: s.currency, amount: s.total }))),
      received: perCurrency(live.map((s) => ({ currency: s.currency, amount: s.received }))),
      receivable: perCurrency(live.map((s) => ({ currency: s.currency, amount: s.outstanding }))),
      costs: perCurrency(
        live.map((s) => ({ currency: s.currency, amount: s.profit.materials + s.profit.extras })),
      ),
      profit: perCurrency(live.map((s) => ({ currency: s.currency, amount: s.profit.profit }))),
      estimated: live.filter((s) => s.profit.basis !== 'recorded').length,
    },
  };
}
