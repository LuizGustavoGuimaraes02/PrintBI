import { model, Schema, type InferSchemaType, type Types } from 'mongoose';
import { tenantScope } from '../tenancy/tenant-scope.plugin';

/** Append-only record of who changed what, when, and why. */
const auditLogSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String },
    changes: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

auditLogSchema.index({ companyId: 1, createdAt: -1 });
auditLogSchema.index({ companyId: 1, entity: 1, entityId: 1, createdAt: -1 });
auditLogSchema.plugin(tenantScope);

export type AuditLog = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model('AuditLog', auditLogSchema);

export interface AuditEntry {
  companyId: Types.ObjectId | string;
  actorId: Types.ObjectId | string;
  action: string;
  entity: string;
  entityId: Types.ObjectId | string;
  reason?: string;
  changes?: Record<string, unknown>;
}
