import { ITEM_KINDS, LOT_STATUSES, MOVEMENT_TYPES, UNITS } from '@printbi/shared';
import { model, Schema, type InferSchemaType } from 'mongoose';
import { microField, moneySchema } from '../../core/db-schemas/money.schema';
import { tenantScope } from '../../core/tenancy/tenant-scope.plugin';

/** One physical roll or purchase lot, with its own quantity and acquisition cost. */
const lotSchema = new Schema({
  label: { type: String, required: true },
  /** Micro-units of the item's unit (grams for filament). */
  originalQuantity: microField(),
  remaining: microField(),
  status: { type: String, enum: LOT_STATUSES, required: true },
  purchasedAt: { type: Date, default: null },
  openedAt: { type: Date, default: null },
  store: { type: String, default: '' },
  notes: { type: String, default: '' },
  totalCost: { type: moneySchema, default: null },
  /** Cost of one unit, derived once at purchase and kept as the lot's cost snapshot. */
  unitCost: { type: moneySchema, default: null },
  expenseId: { type: Schema.Types.ObjectId, ref: 'Expense', default: null },
  /** Set on the first movement out: the cost can no longer change afterwards. */
  used: { type: Boolean, default: false },
});

const filamentSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'FilamentProduct', default: null },
    materialType: { type: String, required: true },
    brand: { type: String, default: '' },
    colorKey: { type: String, default: null },
    colorName: { type: String, required: true },
    colorHex: { type: String, default: null },
    diameterMm: { type: Number, default: 1.75 },
    densityGcm3: { type: Number, default: null },
    nozzleTempMin: { type: Number, default: null },
    nozzleTempMax: { type: Number, default: null },
    bedTempMin: { type: Number, default: null },
    bedTempMax: { type: Number, default: null },
  },
  { _id: false },
);

const inventoryItemSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    kind: { type: String, enum: ITEM_KINDS, required: true },
    name: { type: String, required: true, trim: true },
    unit: { type: String, enum: UNITS, required: true },
    customUnit: { type: String, default: '' },
    category: { type: String, default: '' },
    description: { type: String, default: '' },
    filament: { type: filamentSchema, default: null },
    lowStockThreshold: { ...microField(false), default: null },
    notes: { type: String, default: '' },
    archivedAt: { type: Date, default: null },
    /** Next lot number, for labels like "Roll 3". */
    lotCounter: { type: Number, default: 0 },
    lots: { type: [lotSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

inventoryItemSchema.index({ companyId: 1, archivedAt: 1, kind: 1, name: 1 });
inventoryItemSchema.plugin(tenantScope);

export type InventoryItem = InferSchemaType<typeof inventoryItemSchema>;
export const InventoryItemModel = model('InventoryItem', inventoryItemSchema);

/**
 * Append-only stock ledger. Rows are never updated or deleted: a mistake is fixed
 * with a new correction row that points at the one it reverses.
 */
const stockMovementSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    itemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    lotId: { type: Schema.Types.ObjectId, required: true },
    lotLabel: { type: String, required: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    delta: microField(),
    balanceBefore: microField(),
    balanceAfter: microField(),
    /** The lot's unit cost when the movement happened. */
    unitCost: { type: moneySchema, default: null },
    reason: { type: String, default: '' },
    /** The client's idempotency key; shared by every line of one operation. */
    groupKey: { type: String, required: true },
    /** groupKey plus line number: unique, so a replayed request cannot write twice. */
    opKey: { type: String, required: true },
    reversalOf: { type: Schema.Types.ObjectId, default: null },
    orderId: { type: Schema.Types.ObjectId, default: null },
    saleId: { type: Schema.Types.ObjectId, default: null },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

stockMovementSchema.index({ companyId: 1, opKey: 1 }, { unique: true });
stockMovementSchema.index({ companyId: 1, groupKey: 1 });
stockMovementSchema.index(
  { companyId: 1, reversalOf: 1 },
  { unique: true, partialFilterExpression: { reversalOf: { $type: 'objectId' } } },
);
stockMovementSchema.index({ companyId: 1, itemId: 1, createdAt: -1 });
stockMovementSchema.index(
  { companyId: 1, orderId: 1 },
  { partialFilterExpression: { orderId: { $type: 'objectId' } } },
);
stockMovementSchema.plugin(tenantScope);

export type StockMovement = InferSchemaType<typeof stockMovementSchema>;
export const StockMovementModel = model('StockMovement', stockMovementSchema);
