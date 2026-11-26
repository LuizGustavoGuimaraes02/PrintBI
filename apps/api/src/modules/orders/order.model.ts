import {
  BLOCK_REASONS,
  LEGACY_STATUS_TARGET,
  LEGACY_STATUSES,
  ORDER_PRIORITIES,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_STATUSES,
  RECIPIENT_KINDS,
} from '@printbi/shared';
import { model, Schema, type InferSchemaType } from 'mongoose';
import { microField, moneySchema } from '../../core/db-schemas/money.schema';
import { tenantScope } from '../../core/tenancy/tenant-scope.plugin';

const moneyList = { type: [moneySchema], default: [] };

/**
 * A job to print. Production (`status`, the board column) and payment are tracked apart.
 * Nothing here deducts stock: usage is recorded explicitly and lands in the stock ledger
 * with this order's id; `costSummary` is that ledger summed up again after each change.
 */
const orderSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ORDER_TYPES, required: true },
    description: { type: String, default: '' },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    quantity: { type: Number, required: true },
    labelIds: { type: [Schema.Types.ObjectId], default: [] },
    recipient: {
      kind: { type: String, enum: RECIPIENT_KINDS, required: true },
      customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
      /** Typed name, or the customer's name when saved (shown if the customer is renamed). */
      name: { type: String, default: '' },
    },
    /** Calendar days as YYYY-MM-DD. */
    orderDate: { type: String, required: true },
    dueDate: { type: String, default: null },
    plannedStart: { type: String, default: null },
    completedAt: { type: Date, default: null },
    priority: { type: String, enum: ORDER_PRIORITIES, default: 'normal' },
    printerId: { type: Schema.Types.ObjectId, default: null },
    material: { type: String, default: '' },
    colors: { type: String, default: '' },
    estimatedMinutes: { type: Number, default: null },
    estimatedGrams: { ...microField(false), default: null },
    finishingNotes: { type: String, default: '' },
    modelUrl: { type: String, default: '' },
    internalNotes: { type: String, default: '' },
    agreedPrice: { type: moneySchema, default: null },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
    paidAt: { type: Date, default: null },
    estimatedCost: { type: moneySchema, default: null },
    quoteId: { type: Schema.Types.ObjectId, ref: 'Quote', default: null },
    /** Linked sale (Part 8). */
    saleId: { type: Schema.Types.ObjectId, default: null },

    status: { type: String, enum: ORDER_STATUSES, required: true },
    /** Fractional key for manual order inside a column. */
    rank: { type: String, required: true },
    /** When the card entered its column: the reminder clock. */
    statusEnteredAt: { type: Date, required: true },
    blocked: {
      type: new Schema(
        {
          reason: { type: String, enum: BLOCK_REASONS, required: true },
          note: { type: String, default: '' },
          since: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    /** Rolls from stock picked for the job; the grams are the print file's estimate. */
    filaments: {
      type: [
        new Schema(
          {
            itemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
            grams: { ...microField(false), default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    /** When the card picture last changed (null without one): its URL changes with it. */
    pictureAt: { type: Date, default: null },
    /** When it became done (completed, and paid for a sale): the board retention clock. */
    settledAt: { type: Date, default: null },
    reminder: {
      snoozedUntil: { type: Date, default: null },
      lastContactAt: { type: Date, default: null },
      lastProgressAt: { type: Date, default: null },
    },
    costSummary: {
      materials: moneyList,
      losses: moneyList,
      unpricedLines: { type: Number, default: 0 },
      lines: { type: Number, default: 0 },
    },
    statusHistory: {
      type: [
        new Schema(
          {
            status: { type: String, enum: [...ORDER_STATUSES, ...LEGACY_STATUSES], required: true },
            at: { type: Date, required: true },
            by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            note: { type: String, default: '' },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

orderSchema.index({ companyId: 1, status: 1, rank: 1 });
orderSchema.index(
  { companyId: 1, 'filaments.itemId': 1 },
  { partialFilterExpression: { 'filaments.itemId': { $exists: true } } },
);
orderSchema.index({ companyId: 1, settledAt: 1 });
orderSchema.index({ companyId: 1, dueDate: 1 });
orderSchema.index({ companyId: 1, completedAt: 1 });
// One order per quote: a second "create order" can never duplicate it.
orderSchema.index(
  { companyId: 1, quoteId: 1 },
  { unique: true, partialFilterExpression: { quoteId: { $type: 'objectId' } } },
);
orderSchema.index(
  { companyId: 1, 'recipient.customerId': 1 },
  { partialFilterExpression: { 'recipient.customerId': { $type: 'objectId' } } },
);
orderSchema.index(
  { companyId: 1, productId: 1 },
  { partialFilterExpression: { productId: { $type: 'objectId' } } },
);
orderSchema.index(
  { companyId: 1, printerId: 1 },
  { partialFilterExpression: { printerId: { $type: 'objectId' } } },
);
orderSchema.plugin(tenantScope);

export type Order = InferSchemaType<typeof orderSchema>;
export const OrderModel = model('Order', orderSchema);

/**
 * An order saved before the board went from eight columns to four reads as its new column,
 * flagged when the old column meant waiting. `npm run migrate:order-stages` rewrites them for
 * good; this keeps any it has not reached yet usable.
 */
export function upgradeLegacyStatus<
  T extends { status: string; statusEnteredAt: Date; blocked?: unknown },
>(row: T): T {
  const target = LEGACY_STATUS_TARGET[row.status as keyof typeof LEGACY_STATUS_TARGET];
  if (!target) return row;
  const waited = row.status === 'waiting' || row.status === 'quote_draft';
  return {
    ...row,
    status: target,
    blocked:
      row.blocked ??
      (waited ? { reason: 'quote_approval', note: '', since: row.statusEnteredAt } : null),
  };
}
