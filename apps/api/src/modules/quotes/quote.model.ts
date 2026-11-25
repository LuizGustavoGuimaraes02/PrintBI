import { CURRENCIES, QUOTE_LANGUAGES, QUOTE_STATUSES } from '@printbi/shared';
import { model, Schema, type InferSchemaType } from 'mongoose';
import { tenantScope } from '../../core/tenancy/tenant-scope.plugin';

/** A quote line copies the description and price at the time: later catalog edits never change it. */
const lineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, default: null },
    calculationId: { type: Schema.Types.ObjectId, default: null },
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, default: '' },
    unitPrice: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    amount: { type: Number, required: true },
    /** Cost components from the calculation (financial data), and the quantity they cover. */
    breakdown: { type: [Schema.Types.Mixed], default: null },
    breakdownQuantity: { type: Number, default: null },
  },
  { _id: false },
);

const quoteSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    number: { type: Number, required: true },
    title: { type: String, default: '' },
    language: { type: String, enum: QUOTE_LANGUAGES, required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    issuedAt: { type: String, required: true },
    validUntil: { type: String, default: null },
    status: { type: String, enum: QUOTE_STATUSES, default: 'draft' },
    /** Set the first time the quote is marked sent; it counts as sent from then on. */
    sentAt: { type: Date, default: null },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    /** The customer's details as they were on the quote. */
    customer: {
      name: { type: String, required: true },
      company: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      address: { type: String, default: '' },
    },
    lines: { type: [lineSchema], default: [] },
    discount: { type: Number, default: 0 },
    delivery: { type: Number, default: 0 },
    taxes: {
      type: [new Schema({ label: String, percent: Number, amount: Number }, { _id: false })],
      default: [],
    },
    subtotal: { type: Number, required: true },
    taxBase: { type: Number, required: true },
    total: { type: Number, required: true },
    showBreakdown: { type: Boolean, default: false },
    leadTime: { type: String, default: '' },
    deliveryMethod: { type: String, default: '' },
    paymentTerms: { type: String, default: '' },
    notes: { type: String, default: '' },
    privateNotes: { type: String, default: '' },
    history: {
      type: [
        new Schema(
          {
            status: { type: String, enum: QUOTE_STATUSES, required: true },
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

quoteSchema.index({ companyId: 1, number: 1 }, { unique: true });
quoteSchema.index({ companyId: 1, status: 1, issuedAt: -1 });
quoteSchema.index({ companyId: 1, customerId: 1 });
quoteSchema.plugin(tenantScope);

export type Quote = InferSchemaType<typeof quoteSchema>;
export const QuoteModel = model('Quote', quoteSchema);
