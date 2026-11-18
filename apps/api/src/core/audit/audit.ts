import type { ClientSession } from 'mongoose';
import { AuditLogModel, type AuditEntry } from './audit-log.model';

export async function audit(entry: AuditEntry, session?: ClientSession): Promise<void> {
  await AuditLogModel.create([entry], { session });
}
