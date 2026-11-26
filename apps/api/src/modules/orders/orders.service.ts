import {
  boardCutoff,
  divide,
  isHiddenFromBoard,
  isOverdue,
  isSettled,
  multiply,
  nextSettledAt,
  quoteCode,
  rankBetween,
  roundToCents,
  staleReminder,
  sum,
  toDecimalString,
  toMicro,
  type BlockReason,
  type CalcInput,
  ORDER_PICTURE_MAX_BYTES,
  type CalcResult,
  type Money,
  type OrderCardView,
  type OrderDraftView,
  type OrderFilamentView,
  type LegacyStatus,
  type OrderListView,
  type OrderMovementView,
  type OrderPriority,
  type OrderStatus,
  type OrderType,
  type OrderView,
  type PaymentStatus,
  type RecipientKind,
  type ReminderThresholds,
  type orderConsumptionSchema,
  type orderFiltersSchema,
  type orderHoldSchema,
  type orderPictureSchema,
  type orderInputSchema,
  type orderMoveSchema,
  type orderReminderSchema,
} from '@printbi/shared';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../core/errors';
import { isDuplicateKey } from '../../core/http/idempotency';
import { CalculationModel } from '../calculations/calculation.model';
import { CompanyModel } from '../companies/company.model';
import { CustomerModel } from '../customers/customer.model';
import { InventoryItemModel, StockMovementModel } from '../inventory/inventory.model';
import { movementViews, recordConsumption } from '../inventory/inventory.service';
import { ProductModel } from '../products/product.model';
import { QuoteModel } from '../quotes/quote.model';
import { UserModel } from '../users/user.model';
import { OrderPictureModel } from './order-picture.model';
import { OrderModel, upgradeLegacyStatus } from './order.model';

type OrderInput = z.output<typeof orderInputSchema>;
type OrderFilters = z.output<typeof orderFiltersSchema>;
type OrderMove = z.output<typeof orderMoveSchema>;

export interface OrderActor {
  companyId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Sees and sets prices and costs. */
  finance: boolean;
  /** Changes the payment status. */
  manageFinance: boolean;
  /** Cancels and reopens orders. */
  archive: boolean;
}

interface OrderRecord {
  _id: Types.ObjectId;
  title: string;
  type: OrderType;
  description?: string | null;
  productId?: Types.ObjectId | null;
  quantity: number;
  labelIds: Types.ObjectId[];
  recipient: { kind: RecipientKind; customerId?: Types.ObjectId | null; name?: string | null };
  orderDate: string;
  dueDate?: string | null;
  plannedStart?: string | null;
  completedAt?: Date | null;
  priority: OrderPriority;
  printerId?: Types.ObjectId | null;
  material?: string | null;
  colors?: string | null;
  estimatedMinutes?: number | null;
  estimatedGrams?: number | null;
  finishingNotes?: string | null;
  modelUrl?: string | null;
  internalNotes?: string | null;
  agreedPrice?: Money | null;
  paymentStatus: PaymentStatus;
  paidAt?: Date | null;
  estimatedCost?: Money | null;
  quoteId?: Types.ObjectId | null;
  saleId?: Types.ObjectId | null;
  status: OrderStatus;
  rank: string;
  statusEnteredAt: Date;
  blocked?: { reason: BlockReason; note?: string | null; since: Date } | null;
  filaments?: { itemId: Types.ObjectId; grams?: number | null }[] | null;
  pictureAt?: Date | null;
  settledAt?: Date | null;
  reminder?: {
    snoozedUntil?: Date | null;
    lastContactAt?: Date | null;
    lastProgressAt?: Date | null;
  } | null;
  costSummary?: {
    materials: Money[];
    losses: Money[];
    unpricedLines?: number | null;
    lines?: number | null;
  } | null;
  statusHistory: {
    status: OrderStatus | LegacyStatus;
    at: Date;
    by: Types.ObjectId;
    note?: string | null;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const DAY_MS = 86_400_000;
const money = (m?: Money | null): Money | null =>
  m ? { amount: m.amount, currency: m.currency } : null;
const iso = (d?: Date | null) => d?.toISOString() ?? null;
const utcToday = () => new Date().toISOString().slice(0, 10);

/** The viewer's day when it is plausible (one day either side of UTC), else UTC. */
function todayFor(requested?: string): string {
  const utc = utcToday();
  if (!requested) return utc;
  const gap = Math.abs(Date.parse(`${requested}T00:00:00Z`) - Date.parse(`${utc}T00:00:00Z`));
  return gap <= DAY_MS ? requested : utc;
}

async function load(actor: OrderActor, id: Types.ObjectId): Promise<OrderRecord> {
  const row = (await OrderModel.findOne({
    _id: id,
    companyId: actor.companyId,
  }).lean()) as unknown as OrderRecord | null;
  if (!row) throw new NotFoundError('Order');
  return upgradeLegacyStatus(row);
}

interface BoardSettings {
  reminders: ReminderThresholds;
  retentionDays: number;
  printers: { _id: Types.ObjectId; name: string; archivedAt?: Date | null }[];
  labels: { _id: Types.ObjectId }[];
}

async function boardSettings(companyId: Types.ObjectId): Promise<BoardSettings> {
  const company = await CompanyModel.findById(companyId, {
    'settings.reminders': 1,
    'settings.board': 1,
    printers: 1,
    labels: 1,
  }).lean();
  if (!company) throw new NotFoundError('Company');
  const r = company.settings?.reminders;
  return {
    reminders: {
      enabled: r?.enabled ?? true,
      quoteWaitingDays: r?.quoteWaitingDays ?? 3,
      approvedNotStartedDays: r?.approvedNotStartedDays ?? 3,
      inProgressDays: r?.inProgressDays ?? 3,
      blockedDays: r?.blockedDays ?? 3,
      printedDays: r?.printedDays ?? 3,
    },
    retentionDays: company.settings?.board?.completedRetentionDays ?? 7,
    printers: company.printers ?? [],
    labels: company.labels ?? [],
  };
}

/** Names of the records the cards point to, fetched once per response. */
async function linkedNames(companyId: Types.ObjectId, rows: OrderRecord[]) {
  const ids = (pick: (r: OrderRecord) => Types.ObjectId | null | undefined) => [
    ...new Set(rows.flatMap((r) => (pick(r) ? [pick(r)!.toString()] : []))),
  ];
  const itemIds = [
    ...new Set(rows.flatMap((r) => (r.filaments ?? []).map((f) => f.itemId.toString()))),
  ];
  const [customers, products, quotes, items] = await Promise.all([
    CustomerModel.find(
      { companyId, _id: { $in: ids((r) => r.recipient.customerId) } },
      { name: 1 },
    ).lean(),
    ProductModel.find({ companyId, _id: { $in: ids((r) => r.productId) } }, { name: 1 }).lean(),
    QuoteModel.find({ companyId, _id: { $in: ids((r) => r.quoteId) } }, { number: 1 }).lean(),
    itemIds.length
      ? InventoryItemModel.find(
          { companyId, _id: { $in: itemIds } },
          { name: 1, filament: 1 },
        ).lean()
      : [],
  ]);
  return {
    customers: new Map(customers.map((c) => [c._id.toString(), c.name])),
    products: new Map(products.map((p) => [p._id.toString(), p.name])),
    quotes: new Map(quotes.map((q) => [q._id.toString(), quoteCode(q.number)])),
    items: new Map(items.map((i) => [i._id.toString(), i])),
  };
}

interface ViewContext {
  settings: BoardSettings;
  names: Awaited<ReturnType<typeof linkedNames>>;
  now: Date;
  today: string;
}

function cardView(row: OrderRecord, ctx: ViewContext): OrderCardView {
  const { settings, names, now, today } = ctx;
  const customerId = row.recipient.customerId?.toString() ?? null;
  const printer = row.printerId
    ? settings.printers.find((p) => p._id.equals(row.printerId!))
    : undefined;
  return {
    id: row._id.toString(),
    title: row.title,
    type: row.type,
    status: row.status,
    rank: row.rank,
    quantity: row.quantity,
    recipient: {
      kind: row.recipient.kind,
      customerId,
      name:
        row.recipient.kind === 'myself'
          ? 'Myself'
          : ((customerId && names.customers.get(customerId)) ?? row.recipient.name ?? ''),
    },
    product: row.productId
      ? { id: row.productId.toString(), name: names.products.get(row.productId.toString()) ?? '' }
      : null,
    labelIds: row.labelIds.map(String),
    dueDate: row.dueDate ?? null,
    priority: row.priority,
    printer: row.printerId
      ? { id: row.printerId.toString(), name: printer?.name ?? 'Removed printer' }
      : null,
    paymentStatus: row.paymentStatus,
    blocked: row.blocked
      ? {
          reason: row.blocked.reason,
          note: row.blocked.note ?? '',
          since: row.blocked.since.toISOString(),
        }
      : null,
    filaments: (row.filaments ?? []).map((f): OrderFilamentView => {
      const item = names.items.get(f.itemId.toString());
      return {
        itemId: f.itemId.toString(),
        name: item?.name ?? 'Removed roll',
        filament: item?.filament
          ? {
              colorKey: item.filament.colorKey ?? null,
              colorHex: item.filament.colorHex ?? null,
              materialType: item.filament.materialType ?? '',
            }
          : null,
        grams: f.grams ?? null,
      };
    }),
    pictureUrl: row.pictureAt
      ? `/api/v1/orders/${row._id.toString()}/picture?v=${row.pictureAt.getTime()}`
      : null,
    usageCount: row.costSummary?.lines ?? 0,
    overdue: isOverdue({ status: row.status, dueDate: row.dueDate ?? null }, today),
    stale: staleReminder(
      {
        status: row.status,
        statusEnteredAt: row.statusEnteredAt,
        lastContactAt: row.reminder?.lastContactAt ?? null,
        lastProgressAt: row.reminder?.lastProgressAt ?? null,
        snoozedUntil: row.reminder?.snoozedUntil ?? null,
        blocked: row.blocked ?? null,
      },
      settings.reminders,
      now,
    ),
    snoozedUntil: iso(row.reminder?.snoozedUntil),
    hidden: isHiddenFromBoard(row.settledAt ?? null, settings.retentionDays, now),
    quote: row.quoteId
      ? { id: row.quoteId.toString(), code: names.quotes.get(row.quoteId.toString()) ?? '' }
      : null,
    statusEnteredAt: row.statusEnteredAt.toISOString(),
    completedAt: iso(row.completedAt),
  };
}

async function fullView(actor: OrderActor, row: OrderRecord, today?: string): Promise<OrderView> {
  const [settings, names, users] = await Promise.all([
    boardSettings(actor.companyId),
    linkedNames(actor.companyId, [row]),
    UserModel.find(
      { _id: { $in: [...new Set(row.statusHistory.map((h) => h.by.toString()))] } },
      { firstName: 1, lastName: 1 },
    ).lean(),
  ]);
  const userNames = new Map(
    users.map((u) => [u._id.toString(), `${u.firstName} ${u.lastName}`.trim()]),
  );
  const cost = row.costSummary;
  return {
    ...cardView(row, { settings, names, now: new Date(), today: todayFor(today) }),
    description: row.description ?? '',
    orderDate: row.orderDate,
    plannedStart: row.plannedStart ?? null,
    material: row.material ?? '',
    colors: row.colors ?? '',
    estimatedMinutes: row.estimatedMinutes ?? null,
    estimatedGrams: row.estimatedGrams ?? null,
    finishingNotes: row.finishingNotes ?? '',
    modelUrl: row.modelUrl ?? '',
    internalNotes: row.internalNotes ?? '',
    agreedPrice: actor.finance ? money(row.agreedPrice) : null,
    estimatedCost: actor.finance ? money(row.estimatedCost) : null,
    costSummary:
      actor.finance && cost
        ? {
            materials: cost.materials.map((m) => money(m)!),
            losses: cost.losses.map((m) => money(m)!),
            unpricedLines: cost.unpricedLines ?? 0,
          }
        : null,
    paidAt: iso(row.paidAt),
    settledAt: iso(row.settledAt),
    lastContactAt: iso(row.reminder?.lastContactAt),
    lastProgressAt: iso(row.reminder?.lastProgressAt),
    saleId: row.saleId?.toString() ?? null,
    history: row.statusHistory.map((h) => ({
      status: h.status,
      at: h.at.toISOString(),
      by: userNames.get(h.by.toString()) ?? 'Former member',
      note: h.note ?? '',
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getOrder(
  actor: OrderActor,
  id: Types.ObjectId,
  today?: string,
): Promise<OrderView> {
  return fullView(actor, await load(actor, id), today);
}

// ---------------------------------------------------------------------------------------------
// Ranks
// ---------------------------------------------------------------------------------------------

const notThis = (id?: Types.ObjectId) => (id ? { _id: { $ne: id } } : {});

/**
 * Where a card lands when no spot was chosen: before the first card with a later deadline
 * (or none), so a column reads from the most urgent down. Without a deadline it goes last.
 */
async function suggestedRank(
  companyId: Types.ObjectId,
  status: OrderStatus,
  dueDate: string | null,
  movingId?: Types.ObjectId,
): Promise<string> {
  const cards = await OrderModel.find(
    { companyId, status, ...notThis(movingId) },
    { rank: 1, dueDate: 1 },
  )
    .sort({ rank: 1, _id: 1 })
    .lean();
  const last = cards.at(-1)?.rank ?? null;
  if (!dueDate) return rankBetween(last, null);
  const index = cards.findIndex((c) => !c.dueDate || c.dueDate > dueDate);
  if (index === -1) return rankBetween(last, null);
  return rankBetween(cards[index - 1]?.rank ?? null, cards[index]!.rank);
}

/** The rank just below `afterId` (or at the top for null) inside a column. */
async function rankAfter(
  companyId: Types.ObjectId,
  status: OrderStatus,
  afterId: string | null,
  movingId: Types.ObjectId,
): Promise<string> {
  const sort = { rank: 1 as const, _id: 1 as const };
  if (afterId === null) {
    const first = await OrderModel.findOne(
      { companyId, status, _id: { $ne: movingId } },
      { rank: 1 },
    )
      .sort(sort)
      .lean();
    return rankBetween(null, first?.rank ?? null);
  }
  const after = await OrderModel.findOne(
    { companyId, status, _id: new Types.ObjectId(afterId) },
    { rank: 1 },
  ).lean();
  if (!after) {
    throw new ValidationError('Some fields are invalid', [
      { path: 'afterId', message: 'That card is not in this column any more' },
    ]);
  }
  const next = await OrderModel.findOne(
    {
      companyId,
      status,
      _id: { $nin: [movingId, after._id] },
      rank: { $gt: after.rank },
    },
    { rank: 1 },
  )
    .sort(sort)
    .lean();
  return rankBetween(after.rank, next?.rank ?? null);
}

// ---------------------------------------------------------------------------------------------
// Create and edit
// ---------------------------------------------------------------------------------------------

const invalid = (path: string, message: string) =>
  new ValidationError('Some fields are invalid', [{ path, message }]);

/** The stored fields from the form, with every reference checked against this company. */
async function build(actor: OrderActor, input: OrderInput, current?: OrderRecord) {
  const now = new Date();
  const settings = await boardSettings(actor.companyId);

  let recipient: { kind: RecipientKind; customerId: Types.ObjectId | null; name: string } = {
    kind: input.recipient.kind,
    customerId: null,
    name: input.recipient.kind === 'name' ? input.recipient.name : '',
  };
  if (input.recipient.kind === 'customer') {
    const customer = await CustomerModel.findOne(
      { _id: input.recipient.customerId, companyId: actor.companyId },
      { name: 1 },
    ).lean();
    if (!customer) throw invalid('recipient.customerId', 'Customer not found');
    recipient = { kind: 'customer', customerId: customer._id, name: customer.name };
  }

  if (
    input.productId &&
    !(await ProductModel.exists({ _id: input.productId, companyId: actor.companyId }))
  ) {
    throw invalid('productId', 'Product not found');
  }
  if (input.printerId) {
    const printer = settings.printers.find((p) => p._id.toString() === input.printerId);
    const keeps = current?.printerId?.toString() === input.printerId;
    if (!printer || (printer.archivedAt && !keeps)) throw invalid('printerId', 'Printer not found');
  }
  const known = new Set(settings.labels.map((l) => l._id.toString()));
  const labelIds = [...new Set(input.labelIds)];
  if (labelIds.some((id) => !known.has(id))) throw invalid('labelIds', 'Label not found');
  if (input.filaments.length) {
    const found = await InventoryItemModel.countDocuments({
      companyId: actor.companyId,
      _id: { $in: input.filaments.map((f) => f.itemId) },
      kind: 'filament',
    });
    if (found !== input.filaments.length) throw invalid('filaments', 'Roll not found in stock');
  }

  // Prices and costs need financial access; without it, what was stored stays.
  const sale = input.type === 'sale';
  const agreedPrice = !sale
    ? null
    : actor.finance
      ? input.agreedPrice
      : (current?.agreedPrice ?? null);
  const estimatedCost = actor.finance ? input.estimatedCost : (current?.estimatedCost ?? null);
  let paymentStatus: PaymentStatus;
  if (!sale) paymentStatus = 'not_required';
  else if (actor.manageFinance) paymentStatus = input.paymentStatus;
  else paymentStatus = current?.type === 'sale' ? current.paymentStatus : 'unpaid';
  const paidAt =
    paymentStatus !== 'paid'
      ? null
      : current?.paymentStatus === 'paid'
        ? (current.paidAt ?? now)
        : now;

  return {
    title: input.title,
    type: input.type,
    description: input.description,
    productId: input.productId ? new Types.ObjectId(input.productId) : null,
    quantity: input.quantity,
    labelIds: labelIds.map((id) => new Types.ObjectId(id)),
    recipient,
    orderDate: input.orderDate,
    dueDate: input.dueDate,
    plannedStart: input.plannedStart,
    priority: input.priority,
    printerId: input.printerId ? new Types.ObjectId(input.printerId) : null,
    material: input.material,
    colors: input.colors,
    estimatedMinutes: input.estimatedMinutes,
    estimatedGrams: input.estimatedGrams,
    finishingNotes: input.finishingNotes,
    modelUrl: input.modelUrl,
    internalNotes: input.internalNotes,
    agreedPrice,
    paymentStatus,
    paidAt,
    estimatedCost,
    filaments: input.filaments.map((f) => ({
      itemId: new Types.ObjectId(f.itemId),
      grams: f.grams,
    })),
  };
}

const ORDER_EXISTS = (orderId: string) =>
  new AppError(409, 'ORDER_EXISTS', 'An order was already made from this quote', { orderId });

/** Saving an order never deducts stock, records a payment or creates a sale. */
export async function createOrder(actor: OrderActor, input: OrderInput): Promise<OrderView> {
  const fields = await build(actor, input);
  const now = new Date();
  let note = '';
  if (input.quoteId) {
    const quote = await QuoteModel.findOne(
      { _id: input.quoteId, companyId: actor.companyId },
      { status: 1, number: 1 },
    ).lean();
    if (!quote) throw invalid('quoteId', 'Quote not found');
    if (quote.status !== 'approved') {
      throw new AppError(409, 'QUOTE_NOT_APPROVED', 'Approve the quote before making its order');
    }
    const existing = await OrderModel.findOne(
      { companyId: actor.companyId, quoteId: quote._id },
      { _id: 1 },
    ).lean();
    if (existing) throw ORDER_EXISTS(existing._id.toString());
    note = `From ${quoteCode(quote.number)}`;
  }
  const status = input.status;
  let created: { _id: Types.ObjectId };
  try {
    created = await OrderModel.create({
      ...fields,
      estimatedGrams: fields.estimatedGrams ?? undefined,
      companyId: actor.companyId,
      quoteId: input.quoteId ? new Types.ObjectId(input.quoteId) : null,
      status,
      rank: await suggestedRank(actor.companyId, status, input.dueDate),
      statusEnteredAt: now,
      blocked: input.blocked && status !== 'completed' ? { ...input.blocked, since: now } : null,
      completedAt: status === 'completed' ? now : null,
      settledAt: nextSettledAt(null, isSettled({ ...fields, status }), now),
      statusHistory: [{ status, at: now, by: actor.userId, note }],
      createdBy: actor.userId,
    });
  } catch (error) {
    // Two clicks at once: the unique index lets only one order per quote through.
    if (isDuplicateKey(error) && input.quoteId) {
      const existing = await OrderModel.findOne(
        { companyId: actor.companyId, quoteId: input.quoteId },
        { _id: 1 },
      ).lean();
      throw ORDER_EXISTS(existing?._id.toString() ?? '');
    }
    throw error;
  }
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'order.created',
    entity: 'order',
    entityId: created._id,
    reason: note,
  });
  return getOrder(actor, created._id);
}

/** Edits the details. The column, its timer and the quote link change only through actions. */
export async function updateOrder(
  actor: OrderActor,
  id: Types.ObjectId,
  input: OrderInput,
): Promise<OrderView> {
  const current = await load(actor, id);
  const fields = await build(actor, input, current);
  const settledAt = nextSettledAt(
    current.settledAt ?? null,
    isSettled({ ...fields, status: current.status }),
    new Date(),
  );
  await OrderModel.updateOne(
    { _id: id, companyId: actor.companyId },
    { $set: { ...fields, settledAt } },
  );
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'order.updated',
    entity: 'order',
    entityId: id,
  });
  return getOrder(actor, id);
}

// ---------------------------------------------------------------------------------------------
// Board actions
// ---------------------------------------------------------------------------------------------

/**
 * Moves a card to a column and a spot. Entering a column restarts its reminder clock;
 * completing starts the retention clock (for a sale, once it is also paid). Moving never
 * records usage, a payment or a sale.
 */
export async function moveOrder(
  actor: OrderActor,
  id: Types.ObjectId,
  input: OrderMove,
  today?: string,
): Promise<OrderView> {
  const current = await load(actor, id);
  const changed = input.status !== current.status;
  if (
    changed &&
    (input.status === 'cancelled' || current.status === 'cancelled') &&
    !actor.archive
  ) {
    throw new ForbiddenError('Only people who can cancel records can cancel or reopen an order');
  }
  const now = new Date();
  const rank =
    input.afterId !== undefined
      ? await rankAfter(actor.companyId, input.status, input.afterId, id)
      : changed
        ? await suggestedRank(actor.companyId, input.status, current.dueDate ?? null, id)
        : current.rank;

  const set: Record<string, unknown> = { status: input.status, rank };
  if (changed) {
    // A finished or cancelled card is not waiting for anything any more.
    if (input.status === 'completed' || input.status === 'cancelled') set.blocked = null;
    set.statusEnteredAt = now;
    set['reminder.snoozedUntil'] = null;
    set.completedAt = input.status === 'completed' ? now : null;
    set.settledAt = nextSettledAt(
      null,
      isSettled({ type: current.type, paymentStatus: current.paymentStatus, status: input.status }),
      now,
    );
  }
  // Guarded by the status it had, so two people moving the same card can't both win.
  const result = await OrderModel.updateOne(
    { _id: id, companyId: actor.companyId, status: current.status },
    {
      $set: set,
      ...(changed && {
        $push: {
          statusHistory: { status: input.status, at: now, by: actor.userId, note: input.note },
        },
      }),
    },
  );
  if (result.matchedCount !== 1) {
    throw new AppError(409, 'ORDER_MOVED', 'Someone else just moved this card. Refresh to see it.');
  }
  if (changed) {
    await audit({
      companyId: actor.companyId,
      actorId: actor.userId,
      action: 'order.moved',
      entity: 'order',
      entityId: id,
      reason: `${current.status} → ${input.status}`,
    });
  }
  return getOrder(actor, id, today);
}

/**
 * Flags a card as waiting for something (quote approval, filament, a printer fix) or clears
 * the flag. The card keeps its column; a new reason restarts the flag's reminder clock.
 */
export async function setHold(
  actor: OrderActor,
  id: Types.ObjectId,
  input: z.output<typeof orderHoldSchema>,
): Promise<OrderView> {
  const current = await load(actor, id);
  if (input.blocked && (current.status === 'completed' || current.status === 'cancelled')) {
    throw new AppError(409, 'ORDER_FINISHED', 'A finished order is not waiting for anything');
  }
  const blocked = input.blocked
    ? {
        reason: input.blocked.reason,
        note: input.blocked.note,
        since:
          current.blocked?.reason === input.blocked.reason ? current.blocked.since : new Date(),
      }
    : null;
  await OrderModel.updateOne(
    { _id: id, companyId: actor.companyId },
    { $set: { blocked, status: current.status } },
  );
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'order.hold',
    entity: 'order',
    entityId: id,
    reason: blocked ? blocked.reason : 'cleared',
  });
  return getOrder(actor, id);
}

const PICTURE = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/;

/** Sets the card picture; the browser has already shrunk it. */
export async function setPicture(
  actor: OrderActor,
  id: Types.ObjectId,
  input: z.output<typeof orderPictureSchema>,
): Promise<OrderView> {
  await load(actor, id);
  const [, contentType, base64] = PICTURE.exec(input.dataUrl)!;
  const data = Buffer.from(base64!, 'base64');
  if (data.length > ORDER_PICTURE_MAX_BYTES) {
    throw invalid('dataUrl', 'The picture is too large');
  }
  await OrderPictureModel.updateOne(
    { companyId: actor.companyId, orderId: id },
    { $set: { contentType, data } },
    { upsert: true },
  );
  await OrderModel.updateOne(
    { _id: id, companyId: actor.companyId },
    { $set: { pictureAt: new Date() } },
  );
  return getOrder(actor, id);
}

export async function removePicture(actor: OrderActor, id: Types.ObjectId): Promise<OrderView> {
  await load(actor, id);
  await OrderPictureModel.deleteOne({ companyId: actor.companyId, orderId: id });
  await OrderModel.updateOne(
    { _id: id, companyId: actor.companyId },
    { $set: { pictureAt: null } },
  );
  return getOrder(actor, id);
}

export async function getPicture(
  actor: OrderActor,
  id: Types.ObjectId,
): Promise<{ contentType: string; data: Buffer }> {
  const picture = await OrderPictureModel.findOne(
    { companyId: actor.companyId, orderId: id },
    { contentType: 1, data: 1 },
  ).lean();
  if (!picture) throw new NotFoundError('Picture');
  return { contentType: picture.contentType, data: Buffer.from(picture.data.buffer) };
}

/** Paid, partly paid or unpaid, until sales record real receipts (Part 8). */
export async function setPayment(
  actor: OrderActor,
  id: Types.ObjectId,
  paymentStatus: PaymentStatus,
): Promise<OrderView> {
  const current = await load(actor, id);
  if (current.type !== 'sale') {
    throw new AppError(409, 'NOT_A_SALE', 'Gifts and personal jobs have nothing to pay');
  }
  const now = new Date();
  const paidAt =
    paymentStatus !== 'paid' ? null : current.paymentStatus === 'paid' ? current.paidAt : now;
  const settledAt = nextSettledAt(
    current.settledAt ?? null,
    isSettled({ type: current.type, status: current.status, paymentStatus }),
    now,
  );
  await OrderModel.updateOne(
    { _id: id, companyId: actor.companyId },
    { $set: { paymentStatus, paidAt, settledAt } },
  );
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'order.payment',
    entity: 'order',
    entityId: id,
    reason: `${current.paymentStatus} → ${paymentStatus}`,
  });
  return getOrder(actor, id);
}

/** "Contacted" restarts the reminder clock; snoozing quiets it for a few days. */
export async function remind(
  actor: OrderActor,
  id: Types.ObjectId,
  input: z.output<typeof orderReminderSchema>,
): Promise<OrderView> {
  await load(actor, id);
  const now = new Date();
  const set =
    input.action === 'contacted'
      ? { 'reminder.lastContactAt': now, 'reminder.snoozedUntil': null }
      : input.action === 'snooze'
        ? { 'reminder.snoozedUntil': new Date(now.getTime() + input.days * DAY_MS) }
        : { 'reminder.snoozedUntil': null };
  await OrderModel.updateOne({ _id: id, companyId: actor.companyId }, { $set: set });
  if (input.action === 'contacted') {
    await audit({
      companyId: actor.companyId,
      actorId: actor.userId,
      action: 'order.contacted',
      entity: 'order',
      entityId: id,
    });
  }
  return getOrder(actor, id);
}

/**
 * Deletes an order entered by mistake. One that recorded stock use is real history: its
 * ledger rows point to it, so it is cancelled instead.
 */
export async function deleteOrder(actor: OrderActor, id: Types.ObjectId): Promise<void> {
  const current = await load(actor, id);
  if (await StockMovementModel.exists({ companyId: actor.companyId, orderId: id })) {
    throw new ConflictError('This order recorded stock use. Cancel it instead: its history stays.');
  }
  await OrderModel.deleteOne({ _id: id, companyId: actor.companyId });
  await OrderPictureModel.deleteOne({ companyId: actor.companyId, orderId: id });
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'order.deleted',
    entity: 'order',
    entityId: id,
    reason: current.title,
  });
}

// ---------------------------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------------------------

export async function recordOrderUsage(
  actor: OrderActor,
  id: Types.ObjectId,
  input: z.output<typeof orderConsumptionSchema>,
  key: string,
) {
  await load(actor, id);
  return recordConsumption(
    {
      companyId: actor.companyId,
      userId: actor.userId,
      canSeeFinance: actor.finance,
      canManageFinance: actor.manageFinance,
    },
    { ...input, orderId: id.toString(), saleId: null },
    key,
  );
}

export async function listOrderMovements(
  actor: OrderActor,
  id: Types.ObjectId,
): Promise<OrderMovementView[]> {
  await load(actor, id);
  const rows = await StockMovementModel.find({
    companyId: actor.companyId,
    orderId: id,
    delta: { $ne: 0 },
  })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  const [views, items] = await Promise.all([
    movementViews(actor.companyId, rows, actor.finance),
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
// From a quote
// ---------------------------------------------------------------------------------------------

/**
 * The starting values for an order made from a quote: who, what, the agreed price and the
 * calculator's time, grams and cost scaled to each line's quantity. The person reviews them,
 * picks a printer and saves; nothing is created here.
 */
export async function draftFromQuote(
  actor: OrderActor,
  quoteId: Types.ObjectId,
): Promise<OrderDraftView> {
  const quote = await QuoteModel.findOne({ _id: quoteId, companyId: actor.companyId }).lean();
  if (!quote) throw new NotFoundError('Quote');
  const [existing, customer] = await Promise.all([
    OrderModel.findOne({ companyId: actor.companyId, quoteId }, { _id: 1 }).lean(),
    quote.customerId
      ? CustomerModel.exists({ _id: quote.customerId, companyId: actor.companyId })
      : null,
  ]);
  const calcIds = quote.lines.flatMap((l) => (l.calculationId ? [l.calculationId] : []));
  const calculations = calcIds.length
    ? await CalculationModel.find(
        { companyId: actor.companyId, _id: { $in: calcIds } },
        { input: 1, result: 1, quantity: 1, currency: 1 },
      ).lean()
    : [];

  const minutes: number[] = [];
  const grams: number[] = [];
  const costs: number[] = [];
  for (const line of quote.lines) {
    const calc = calculations.find((c) => line.calculationId && c._id.equals(line.calculationId));
    if (!calc) continue;
    const input = calc.input as CalcInput;
    const result = calc.result as CalcResult;
    // The calculation covers its own quantity; scale it to the line's.
    const ratio = divide(line.quantity, toMicro(calc.quantity));
    minutes.push(multiply(multiply(result.hours, ratio), toMicro(60)));
    if (input.filament.enabled) {
      const perCalc = sum(input.filament.lines.map((f) => f.grams));
      const batch = input.basis === 'unit' ? perCalc * calc.quantity : perCalc;
      grams.push(multiply(batch, ratio));
    }
    if (calc.currency === quote.currency) costs.push(multiply(result.unitCost, line.quantity));
  }

  const lines = quote.lines;
  const only = lines.length === 1 ? lines[0] : undefined;
  const pieces = (micro: number) => Math.max(1, Math.round(micro / 1_000_000));
  return {
    quote: { id: quote._id.toString(), code: quoteCode(quote.number), status: quote.status },
    existingOrderId: existing?._id.toString() ?? null,
    draft: {
      title: quote.title || only?.description || quoteCode(quote.number),
      description: lines
        .map(
          (l) => `${toDecimalString(l.quantity)}${l.unit ? ` ${l.unit}` : ''} × ${l.description}`,
        )
        .join('\n'),
      productId: only?.productId?.toString() ?? null,
      quantity: only ? pieces(only.quantity) : 1,
      recipient:
        quote.customerId && customer
          ? {
              kind: 'customer',
              customerId: quote.customerId.toString(),
              name: quote.customer?.name ?? '',
            }
          : { kind: 'name', customerId: null, name: quote.customer?.name ?? '' },
      agreedPrice: actor.finance ? { amount: quote.total, currency: quote.currency } : null,
      estimatedCost:
        actor.finance && costs.length
          ? { amount: roundToCents(sum(costs)), currency: quote.currency }
          : null,
      estimatedMinutes: minutes.length ? Math.round(sum(minutes) / 1_000_000) : null,
      estimatedGrams: grams.length ? sum(grams) : null,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------------------------

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OPEN = { $nin: ['completed', 'cancelled'] as OrderStatus[] };

export async function listOrders(actor: OrderActor, filters: OrderFilters): Promise<OrderListView> {
  const now = new Date();
  const today = todayFor(filters.today);
  const settings = await boardSettings(actor.companyId);
  const cutoff = boardCutoff(settings.retentionDays, now);
  const companyId = actor.companyId;

  const and: Record<string, unknown>[] = [];
  const query: Record<string, unknown> = { companyId };
  if (filters.status) query.status = filters.status;
  if (filters.board === 'active') {
    if (!filters.status) query.status = { $ne: 'cancelled' };
    and.push({ $or: [{ settledAt: null }, { settledAt: { $gt: cutoff } }] });
  } else if (filters.board === 'hidden') {
    and.push({ settledAt: { $lte: cutoff } });
  }
  if (filters.type) query.type = filters.type;
  if (filters.priority) query.priority = filters.priority;
  if (filters.customerId) query['recipient.customerId'] = new Types.ObjectId(filters.customerId);
  if (filters.productId) query.productId = new Types.ObjectId(filters.productId);
  if (filters.labelId) query.labelIds = new Types.ObjectId(filters.labelId);
  if (filters.printerId) {
    query.printerId = filters.printerId === 'none' ? null : new Types.ObjectId(filters.printerId);
  }
  const due: Record<string, unknown> = {};
  if (filters.deadline === 'with') due.$ne = null;
  if (filters.deadline === 'without') query.dueDate = null;
  if (filters.dueFrom) due.$gte = filters.dueFrom;
  if (filters.dueTo) due.$lte = filters.dueTo;
  if (filters.overdue) {
    due.$lt = today;
    due.$ne = null;
    and.push({ status: OPEN });
  }
  if (Object.keys(due).length && filters.deadline !== 'without') query.dueDate = due;
  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), 'i');
    and.push({
      $or: [{ title: pattern }, { 'recipient.name': pattern }, { description: pattern }],
    });
  }
  if (and.length) query.$and = and;

  const completed: Record<string, Date> = {};
  if (filters.completedFrom) completed.$gte = filters.completedFrom;
  if (filters.completedTo) completed.$lte = filters.completedTo;

  const [rows, todo, inProgress, overdue, done] = await Promise.all([
    OrderModel.find(query, { statusHistory: 0 }).sort({ rank: 1, _id: 1 }).limit(500).lean(),
    OrderModel.countDocuments({ companyId, status: 'todo' }),
    OrderModel.countDocuments({ companyId, status: 'in_progress' }),
    OrderModel.countDocuments({ companyId, status: OPEN, dueDate: { $ne: null, $lt: today } }),
    OrderModel.countDocuments({
      companyId,
      status: 'completed',
      ...(Object.keys(completed).length && { completedAt: completed }),
    }),
  ]);
  const records = (rows as unknown as OrderRecord[]).map(upgradeLegacyStatus);
  const names = await linkedNames(companyId, records);
  const ctx = { settings, names, now, today };
  return {
    orders: records.map((r) => cardView({ ...r, statusHistory: [] }, ctx)),
    counts: { todo, inProgress, overdue, completed: done },
    retentionDays: settings.retentionDays,
  };
}
