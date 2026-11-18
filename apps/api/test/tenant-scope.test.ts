import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogModel } from '../src/core/audit/audit-log.model';
import { TenantScopeError } from '../src/core/tenancy/tenant-scope.plugin';
import { connectTestDatabase } from './memory-db';

let teardown: () => Promise<void>;

beforeAll(async () => {
  teardown = await connectTestDatabase();
});
afterAll(async () => teardown());

describe('tenantScope plugin', () => {
  it('refuses queries without companyId', async () => {
    await expect(AuditLogModel.find({})).rejects.toThrow(TenantScopeError);
    await expect(AuditLogModel.countDocuments({ action: 'x' })).rejects.toThrow(TenantScopeError);
    await expect(AuditLogModel.updateMany({}, { reason: 'x' })).rejects.toThrow(TenantScopeError);
    await expect(AuditLogModel.deleteMany({})).rejects.toThrow(TenantScopeError);
  });

  it('refuses aggregations that do not start by matching companyId', async () => {
    await expect(AuditLogModel.aggregate([{ $match: {} }])).rejects.toThrow(TenantScopeError);
    await expect(AuditLogModel.aggregate([{ $sort: { createdAt: -1 } }])).rejects.toThrow(
      TenantScopeError,
    );
  });

  it('allows scoped queries and only returns that company', async () => {
    const companyA = new Types.ObjectId();
    const companyB = new Types.ObjectId();
    const entry = {
      actorId: new Types.ObjectId(),
      action: 'test',
      entity: 'test',
      entityId: new Types.ObjectId(),
    };
    await AuditLogModel.create([
      { ...entry, companyId: companyA },
      { ...entry, companyId: companyB },
    ]);

    const rows = await AuditLogModel.find({ companyId: companyA }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.companyId.equals(companyA)).toBe(true);

    const counted = await AuditLogModel.aggregate([
      { $match: { companyId: companyB } },
      { $count: 'n' },
    ]);
    expect(counted).toEqual([{ n: 1 }]);
  });

  it('allows an explicit opt-out for maintenance tasks', async () => {
    await expect(
      AuditLogModel.find({}).setOptions({ skipTenantScope: true }),
    ).resolves.toBeDefined();
  });
});
