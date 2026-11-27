import { CURRENCIES, PAYMENT_METHODS, SALE_CUSTOMER_KINDS, SALE_PRODUCTION } from '@printbi/shared';
import { model, Schema, type InferSchemaType } from 'mongoose';
import { microField, moneySchema } from '../../core/db-schemas/money.schema';
import { tenantScope } from '../../core/tenancy/tenant-scope.plugin';

const moneyList = { type: [moneySchema], default: [] };

/** A line copies the description, price and labels at the time: later catalog edits never change it. */
const lineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, default: null },
    description: { type: String, required: true },
    quantity: microField(),
    unitPrice: microField(),
    discount: { ...microField(), default: 0 },
    amount: microField(),
    estimatedCost: { ...microField(false), default: null },
    labels: {
      type: [new Schema({ id: Schema.Types.ObjectId, name: String }, { _id: false })],
      default: [],
    },
  },
  { _id: false },
);

/**
 * A sale: what was sold, what was received and what it cost. Receipts are separate from the
 * amount sold. Cancelling keeps everything and leaves stock and receipts alone.
 */
const saleSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    number: { type: Number, required: true },
    saleDate: { type: String, required: true },
    customer: {
      kind: { type: String, enum: SALE_CUSTOMER_KINDS, required: true },
      customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
      /** Typed name, or the customer's name when saved (shown if the customer is renamed). */
      name: { type: String, default: '' },
    },
    sourceId: { type: Schema.Types.ObjectId, default: null },
    currency: { type: String, enum: CURRENCIES, required: true },
    lines: { type: [lineSchema], default: [] },
    subtotal: microField(),
    discount: { ...microField(), default: 0 },
    delivery: { ...microField(), default: 0 },
    total: microField(),
    costs: {
      type: [new Schema({ label: String, amount: microField() }, { _id: false })],
      default: [],
    },
    receipts: {
      type: [
        new Schema({
          amount: microField(),
          receivedAt: { type: String, required: true },
          method: { type: String, enum: PAYMENT_METHODS, required: true },
          note: { type: String, default: '' },
          by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        }),
      ],
      default: [],
    },
    received: { ...microField(), default: 0 },
    production: { type: String, enum: SALE_PRODUCTION, default: 'to_start' },
    notes: { type: String, default: '' },
    quoteId: { type: Schema.Types.ObjectId, ref: 'Quote', default: null },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    /** BRL per CAD when the sale was made: converts costs recorded in the other currency. */
    brlPerCad: { ...microField(false), default: null },
    /** Stock recorded straight on the sale (a sale without an order), summed from the ledger. */
    costSummary: {
      materials: moneyList,
      losses: moneyList,
      unpricedLines: { type: Number, default: 0 },
      lines: { type: Number, default: 0 },
    },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

saleSchema.index({ companyId: 1, number: 1 }, { unique: true });
saleSchema.index({ companyId: 1, saleDate: -1 });
// One sale per order and per quote: a second "register sale" can never duplicate it.
saleSchema.index(
  { companyId: 1, orderId: 1 },
  { unique: true, partialFilterExpression: { orderId: { $type: 'objectId' } } },
);
saleSchema.index(
  { companyId: 1, quoteId: 1 },
  { unique: true, partialFilterExpression: { quoteId: { $type: 'objectId' } } },
);
saleSchema.index(
  { companyId: 1, 'customer.customerId': 1 },
  { partialFilterExpression: { 'customer.customerId': { $type: 'objectId' } } },
);
saleSchema.index(
  { companyId: 1, 'lines.productId': 1 },
  { partialFilterExpression: { 'lines.productId': { $type: 'objectId' } } },
);
saleSchema.plugin(tenantScope);

export type Sale = InferSchemaType<typeof saleSchema>;
export const SaleModel = model('Sale', saleSchema);
