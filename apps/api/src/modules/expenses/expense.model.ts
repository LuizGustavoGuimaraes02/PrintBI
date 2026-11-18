import { EXPENSE_STATUSES, PAYMENT_METHODS } from '@printbi/shared';
import { model, Schema, type InferSchemaType } from 'mongoose';
import { microField, moneySchema } from '../../core/db-schemas/money.schema';
import { tenantScope } from '../../core/tenancy/tenant-scope.plugin';

const paymentSchema = new Schema({
  /** Micro-units in the expense's currency. */
  amount: microField(),
  paidAt: { type: Date, required: true },
  method: { type: String, enum: PAYMENT_METHODS, required: true },
  note: { type: String, default: '' },
  /** Idempotency key of the request that added it: a retried click cannot pay twice. */
  opKey: { type: String, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

const expenseSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    description: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: moneySchema, required: true },
    /** Denormalized sum of payments, kept in step on every change (for filters and totals). */
    paid: { ...microField(), default: 0 },
    status: { type: String, enum: EXPENSE_STATUSES, required: true },
    purchasedAt: { type: Date, required: true },
    vendor: { type: String, default: '' },
    dueDate: { type: Date, default: null },
    notes: { type: String, default: '' },
    payments: { type: [paymentSchema], default: [] },
    /** Stock lots this expense paid for: one roll, or every roll of a multi-color order. */
    stock: {
      type: [
        new Schema(
          {
            itemId: { type: Schema.Types.ObjectId, required: true },
            lotId: { type: Schema.Types.ObjectId, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

expenseSchema.index({ companyId: 1, purchasedAt: -1 });
expenseSchema.index({ companyId: 1, status: 1 });
expenseSchema.index({ companyId: 1, 'payments.paidAt': 1 });
// One purchase, one expense: a lot can appear in only one expense (unique across documents).
expenseSchema.index(
  { companyId: 1, 'stock.lotId': 1 },
  { unique: true, partialFilterExpression: { 'stock.lotId': { $type: 'objectId' } } },
);
expenseSchema.plugin(tenantScope);

export type Expense = InferSchemaType<typeof expenseSchema>;
export const ExpenseModel = model('Expense', expenseSchema);
