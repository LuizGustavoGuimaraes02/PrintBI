import type { MongooseQueryMiddleware, Query, Schema } from 'mongoose';

/**
 * Mongoose plugin for every collection that belongs to a company.
 *
 * Any query or aggregation that does not filter by `companyId` throws, so a
 * forgotten filter can never read or change another company's data. A cross-tenant
 * operation (a maintenance script) must opt out explicitly with `{ skipTenantScope: true }`.
 */
const QUERY_OPERATIONS: MongooseQueryMiddleware[] = [
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne',
];

export class TenantScopeError extends Error {
  override name = 'TenantScopeError';
}

export function tenantScope(schema: Schema): void {
  schema.pre(QUERY_OPERATIONS, function (this: Query<unknown, unknown>) {
    if (this.getOptions().skipTenantScope) return;
    if (this.getFilter().companyId === undefined) {
      throw new TenantScopeError(`${this.model.modelName} query without companyId`);
    }
  });

  schema.pre('aggregate', function () {
    if (this.options.skipTenantScope) return;
    const [first] = this.pipeline();
    const match =
      first && '$match' in first ? (first.$match as Record<string, unknown>) : undefined;
    if (match?.companyId === undefined) {
      throw new TenantScopeError('aggregate must start with { $match: { companyId } }');
    }
  });
}

declare module 'mongoose' {
  interface QueryOptions {
    skipTenantScope?: boolean;
  }
  interface AggregateOptions {
    skipTenantScope?: boolean;
  }
}
