import { CURRENCIES } from '@printbi/shared';
import { model, Schema, type InferSchemaType } from 'mongoose';
import { tenantScope } from '../../core/tenancy/tenant-scope.plugin';

/**
 * A saved calculator run: what was entered and the result worked out by the server when it
 * was saved (a snapshot, so later price changes in stock or settings never rewrite it).
 */
const calculationSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    name: { type: String, required: true, trim: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    notes: { type: String, default: '' },
    currency: { type: String, enum: CURRENCIES, required: true },
    quantity: { type: Number, required: true },
    /** Micro-units in `currency`, kept apart for the list and sorting. */
    unitCost: { type: Number, required: true },
    unitPrice: { type: Number, default: null },
    input: { type: Schema.Types.Mixed, required: true },
    result: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, minimize: false },
);

calculationSchema.index({ companyId: 1, updatedAt: -1 });
calculationSchema.index({ companyId: 1, productId: 1 });
calculationSchema.plugin(tenantScope);

export type Calculation = InferSchemaType<typeof calculationSchema>;
export const CalculationModel = model('Calculation', calculationSchema);
