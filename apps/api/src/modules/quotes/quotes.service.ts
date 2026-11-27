import {
  breakdownFromCalculation,
  displayStatus,
  quoteCode,
  quoteTotals,
  toMicro,
  type BreakdownRow,
  type CalcInput,
  type CalcResult,
  type QuoteAction,
  type QuoteListView,
  type QuoteStatus,
  type QuoteSummaryView,
  type QuoteView,
  type quoteFiltersSchema,
  type quoteInputSchema,
} from '@printbi/shared';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import { CalculationModel } from '../calculations/calculation.model';
import { CompanyModel } from '../companies/company.model';
import { CustomerModel } from '../customers/customer.model';
import { UserModel } from '../users/user.model';
import { OrderModel } from '../orders/order.model';
import { SaleModel } from '../sales/sale.model';
import { QuoteModel } from './quote.model';

type QuoteInput = z.output<typeof quoteInputSchema>;

export interface QuoteActor {
  companyId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Breakdowns carry purchase costs: only people with financial access see or change them. */
  finance: boolean;
}

/** Today as YYYY-MM-DD (UTC), for expiry. */
const today = () => new Date().toISOString().slice(0, 10);

interface LineRecord {
  productId?: Types.ObjectId | null;
  calculationId?: Types.ObjectId | null;
  description: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  discount?: number | null;
  amount: number;
  breakdown?: BreakdownRow[] | null;
  breakdownQuantity?: number | null;
}

interface QuoteRecord {
  _id: Types.ObjectId;
  number: number;
  title?: string | null;
  language: QuoteView['language'];
  currency: QuoteView['currency'];
  issuedAt: string;
  validUntil?: string | null;
  status: QuoteStatus;
  sentAt?: Date | null;
  customerId?: Types.ObjectId | null;
  customer: QuoteView['customer'];
  lines: LineRecord[];
  discount: number;
  delivery: number;
  taxes: { label: string; percent: number; amount: number }[];
  subtotal: number;
  taxBase: number;
  total: number;
  showBreakdown?: boolean | null;
  leadTime?: string | null;
  deliveryMethod?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  privateNotes?: string | null;
  history: { status: QuoteStatus; at: Date; by: Types.ObjectId; note?: string | null }[];
  createdAt: Date;
  updatedAt: Date;
}

async function load(actor: QuoteActor, id: Types.ObjectId): Promise<QuoteRecord> {
  const row = (await QuoteModel.findOne({
    _id: id,
    companyId: actor.companyId,
  }).lean()) as unknown as QuoteRecord | null;
  if (!row) throw new NotFoundError('Quote');
  return row;
}

async function toView(actor: QuoteActor, row: QuoteRecord): Promise<QuoteView> {
  const userIds = [...new Set(row.history.map((h) => h.by.toString()))];
  const [users, order, sale] = await Promise.all([
    UserModel.find({ _id: { $in: userIds } }, { firstName: 1, lastName: 1 }).lean(),
    OrderModel.findOne({ companyId: actor.companyId, quoteId: row._id }, { _id: 1 }).lean(),
    SaleModel.findOne({ companyId: actor.companyId, quoteId: row._id }, { _id: 1 }).lean(),
  ]);
  const names = new Map(
    users.map((u) => [u._id.toString(), `${u.firstName} ${u.lastName}`.trim()]),
  );
  return {
    id: row._id.toString(),
    number: row.number,
    code: quoteCode(row.number),
    title: row.title ?? '',
    language: row.language,
    currency: row.currency,
    issuedAt: row.issuedAt,
    validUntil: row.validUntil ?? null,
    status: row.status,
    displayStatus: displayStatus(row.status, row.validUntil ?? null, today()),
    customerId: row.customerId?.toString() ?? null,
    customer: {
      name: row.customer.name,
      company: row.customer.company ?? '',
      email: row.customer.email ?? '',
      phone: row.customer.phone ?? '',
      address: row.customer.address ?? '',
    },
    lines: row.lines.map((l) => ({
      productId: l.productId?.toString() ?? null,
      calculationId: l.calculationId?.toString() ?? null,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit ?? '',
      unitPrice: l.unitPrice,
      discount: l.discount ?? 0,
      amount: l.amount,
      breakdown: actor.finance ? (l.breakdown ?? null) : null,
      breakdownQuantity: actor.finance ? (l.breakdownQuantity ?? null) : null,
    })),
    discount: row.discount,
    delivery: row.delivery,
    taxes: row.taxes.map((t) => ({ label: t.label, percent: t.percent, amount: t.amount })),
    subtotal: row.subtotal,
    taxBase: row.taxBase,
    total: row.total,
    showBreakdown: row.showBreakdown ?? false,
    leadTime: row.leadTime ?? '',
    deliveryMethod: row.deliveryMethod ?? '',
    paymentTerms: row.paymentTerms ?? '',
    notes: row.notes ?? '',
    privateNotes: row.privateNotes ?? '',
    history: row.history.map((h) => ({
      status: h.status,
      at: h.at.toISOString(),
      by: names.get(h.by.toString()) ?? '',
      note: h.note ?? '',
    })),
    orderId: order?._id.toString() ?? null,
    saleId: sale?._id.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getQuote(actor: QuoteActor, id: Types.ObjectId): Promise<QuoteView> {
  return toView(actor, await load(actor, id));
}

/**
 * Everything stored from the form: the customer's details (from the record when one is
 * linked), lines with their amounts and breakdowns, and the totals, all worked out here.
 */
async function build(actor: QuoteActor, input: QuoteInput, current?: QuoteRecord) {
  let customer = input.customer;
  if (input.customerId) {
    const record = await CustomerModel.findOne(
      { _id: input.customerId, companyId: actor.companyId },
      { name: 1, company: 1, email: 1, phone: 1, address: 1 },
    ).lean();
    if (!record)
      throw new ValidationError('Customer not found', [
        { path: 'customerId', message: 'Customer not found' },
      ]);
    customer = {
      name: record.name,
      company: record.company ?? '',
      email: record.email ?? '',
      phone: record.phone ?? '',
      address: record.address ?? '',
    };
  }

  const calcIds = [
    ...new Set(input.lines.flatMap((l) => (l.calculationId ? [l.calculationId] : []))),
  ];
  const calculations =
    actor.finance && calcIds.length
      ? await CalculationModel.find(
          { companyId: actor.companyId, _id: { $in: calcIds } },
          { input: 1, result: 1, quantity: 1 },
        ).lean()
      : [];

  const totals = quoteTotals(input);
  const lines = input.lines.map((line, index) => {
    let breakdown: BreakdownRow[] | null = null;
    let breakdownQuantity: number | null = null;
    if (line.calculationId && actor.finance) {
      const calc = calculations.find((c) => c._id.toString() === line.calculationId);
      if (!calc) {
        throw new ValidationError('Calculation not found', [
          { path: `lines.${index}.calculationId`, message: 'That calculation no longer exists' },
        ]);
      }
      breakdown = breakdownFromCalculation(calc.input as CalcInput, calc.result as CalcResult);
      breakdownQuantity = toMicro(calc.quantity);
    } else if (line.calculationId) {
      // Without financial access the breakdown can't be seen, so it is kept as it was.
      const before = current?.lines.find((l) => l.calculationId?.toString() === line.calculationId);
      breakdown = before?.breakdown ?? null;
      breakdownQuantity = before?.breakdownQuantity ?? null;
    }
    return {
      productId: line.productId ? new Types.ObjectId(line.productId) : null,
      calculationId: line.calculationId ? new Types.ObjectId(line.calculationId) : null,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      discount: line.discount,
      amount: totals.lines[index] ?? 0,
      breakdown,
      breakdownQuantity,
    };
  });

  return {
    title: input.title,
    language: input.language,
    currency: input.currency,
    issuedAt: input.issuedAt,
    validUntil: input.validUntil,
    customerId: input.customerId ? new Types.ObjectId(input.customerId) : null,
    customer,
    lines,
    discount: totals.discount,
    delivery: totals.delivery,
    taxes: input.taxes.map((t, i) => ({
      label: t.label,
      percent: t.percent,
      amount: totals.taxes[i] ?? 0,
    })),
    subtotal: totals.subtotal,
    taxBase: totals.taxBase,
    total: totals.total,
    showBreakdown: input.showBreakdown,
    leadTime: input.leadTime,
    deliveryMethod: input.deliveryMethod,
    paymentTerms: input.paymentTerms,
    notes: input.notes,
    privateNotes: input.privateNotes,
  };
}

export async function createQuote(actor: QuoteActor, input: QuoteInput): Promise<QuoteView> {
  const fields = await build(actor, input);
  // One atomic step hands out the next number, so two quotes can never share one.
  const company = await CompanyModel.findOneAndUpdate(
    { _id: actor.companyId },
    { $inc: { 'counters.quote': 1 } },
    { returnDocument: 'after', projection: { counters: 1 } },
  ).lean();
  if (!company) throw new NotFoundError('Company');
  const created = await QuoteModel.create({
    ...fields,
    companyId: actor.companyId,
    number: company.counters?.quote ?? 1,
    status: 'draft',
    history: [{ status: 'draft', at: new Date(), by: actor.userId, note: '' }],
    createdBy: actor.userId,
  });
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'quote.created',
    entity: 'quote',
    entityId: created._id,
  });
  return getQuote(actor, created._id);
}

const LOCKED = () =>
  new AppError(409, 'QUOTE_LOCKED', 'This quote has an outcome. Reopen it to make changes.');

export async function updateQuote(
  actor: QuoteActor,
  id: Types.ObjectId,
  input: QuoteInput,
): Promise<QuoteView> {
  const current = await load(actor, id);
  if (current.status !== 'draft' && current.status !== 'sent') throw LOCKED();
  const fields = await build(actor, input, current);
  const result = await QuoteModel.updateOne(
    { _id: id, companyId: actor.companyId, status: { $in: ['draft', 'sent'] } },
    { $set: fields },
  );
  if (result.matchedCount !== 1) throw LOCKED();
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'quote.updated',
    entity: 'quote',
    entityId: id,
  });
  return getQuote(actor, id);
}

/** Which statuses each action may start from, and where it leads. */
const TRANSITIONS: Record<QuoteAction, { from: QuoteStatus[]; to: QuoteStatus }> = {
  send: { from: ['draft', 'sent'], to: 'sent' },
  approve: { from: ['draft', 'sent'], to: 'approved' },
  reject: { from: ['draft', 'sent'], to: 'rejected' },
  cancel: { from: ['draft', 'sent'], to: 'cancelled' },
  reopen: { from: ['approved', 'rejected', 'cancelled'], to: 'draft' },
};

/**
 * Moves a quote along. Marking it sent is a separate, explicit step: generating the PDF is not
 * proof that it was sent. None of these touch stock, payments or sales.
 */
export async function applyQuoteAction(
  actor: QuoteActor,
  id: Types.ObjectId,
  action: QuoteAction,
  note: string,
): Promise<QuoteView> {
  const rule = TRANSITIONS[action];
  const now = new Date();
  const set: Record<string, unknown> = { status: rule.to };
  const result = await QuoteModel.updateOne(
    { _id: id, companyId: actor.companyId, status: { $in: rule.from } },
    {
      $set: set,
      $push: { history: { status: rule.to, at: now, by: actor.userId, note } },
    },
  );
  if (result.matchedCount !== 1) {
    await load(actor, id); // 404 when it doesn't exist
    throw new AppError(
      409,
      'QUOTE_STATUS',
      `A quote can't be ${PAST[action]} from its current status`,
    );
  }
  if (action === 'send') {
    await QuoteModel.updateOne(
      { _id: id, companyId: actor.companyId, sentAt: null },
      { $set: { sentAt: now } },
    );
  }
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: `quote.${action}`,
    entity: 'quote',
    entityId: id,
    reason: note,
  });
  return getQuote(actor, id);
}

const PAST: Record<QuoteAction, string> = {
  send: 'marked sent',
  approve: 'approved',
  reject: 'rejected',
  cancel: 'cancelled',
  reopen: 'reopened',
};

/** Deletes a quote made by mistake. One that became an order stays as that order's source. */
export async function deleteQuote(actor: QuoteActor, id: Types.ObjectId): Promise<void> {
  if (await OrderModel.exists({ companyId: actor.companyId, quoteId: id })) {
    throw new ConflictError(
      'An order was made from this quote. Delete that order first, or keep the quote.',
    );
  }
  if (await SaleModel.exists({ companyId: actor.companyId, quoteId: id })) {
    throw new ConflictError(
      'A sale was registered from this quote. Delete that sale first, or keep the quote.',
    );
  }
  const row = await QuoteModel.findOneAndDelete(
    { _id: id, companyId: actor.companyId },
    { projection: { number: 1 } },
  ).lean();
  if (!row) throw new NotFoundError('Quote');
  await audit({
    companyId: actor.companyId,
    actorId: actor.userId,
    action: 'quote.deleted',
    entity: 'quote',
    entityId: id,
    reason: quoteCode(row.number),
  });
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listQuotes(
  actor: QuoteActor,
  filters: z.output<typeof quoteFiltersSchema>,
): Promise<QuoteListView> {
  const day = today();
  const query: Record<string, unknown> = { companyId: actor.companyId };
  if (filters.customerId) query.customerId = new Types.ObjectId(filters.customerId);
  if (filters.status === 'expired') {
    query.status = { $in: ['draft', 'sent'] };
    query.validUntil = { $lt: day, $ne: null };
  } else if (filters.status === 'draft' || filters.status === 'sent') {
    query.status = filters.status;
    query.$and = [{ $or: [{ validUntil: null }, { validUntil: { $gte: day } }] }];
  } else if (filters.status) {
    query.status = filters.status;
  }
  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), 'i');
    const digits = Number(filters.q.replace(/\D/g, ''));
    query.$or = [
      { title: pattern },
      { 'customer.name': pattern },
      ...(digits ? [{ number: digits }] : []),
    ];
  }
  const [rows, all] = await Promise.all([
    QuoteModel.find(query, {
      number: 1,
      title: 1,
      customer: 1,
      issuedAt: 1,
      validUntil: 1,
      status: 1,
      total: 1,
      currency: 1,
    })
      .sort({ number: -1 })
      .limit(300)
      .lean(),
    QuoteModel.find({ companyId: actor.companyId }, { status: 1, validUntil: 1, sentAt: 1 }).lean(),
  ]);
  const counts: QuoteListView['counts'] = {
    draft: 0,
    sent: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    expired: 0,
  };
  let sentCount = 0;
  for (const q of all) {
    counts[displayStatus(q.status as QuoteStatus, q.validUntil ?? null, day)] += 1;
    if (q.sentAt) sentCount += 1;
  }
  const quotes: QuoteSummaryView[] = rows.map((r) => ({
    id: r._id.toString(),
    code: quoteCode(r.number),
    title: r.title ?? '',
    customerName: r.customer?.name ?? '',
    issuedAt: r.issuedAt,
    validUntil: r.validUntil ?? null,
    status: r.status as QuoteStatus,
    displayStatus: displayStatus(r.status as QuoteStatus, r.validUntil ?? null, day),
    total: { amount: r.total, currency: r.currency as QuoteSummaryView['total']['currency'] },
  }));
  return { quotes, counts, sentCount };
}
