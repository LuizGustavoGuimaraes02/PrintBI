import { model, Schema, type InferSchemaType } from 'mongoose';
import { tenantScope } from '../../core/tenancy/tenant-scope.plugin';

const customerSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    name: { type: String, required: true, trim: true },
    company: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '', lowercase: true, trim: true },
    address: { type: String, default: '' },
    notes: { type: String, default: '' },
    archivedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

customerSchema.index({ companyId: 1, archivedAt: 1, name: 1 });
customerSchema.plugin(tenantScope);

export type Customer = InferSchemaType<typeof customerSchema>;
export const CustomerModel = model('Customer', customerSchema);
