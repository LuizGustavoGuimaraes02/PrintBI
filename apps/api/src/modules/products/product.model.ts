import { COLLECTION_KEYS, PRODUCT_TYPES, SALE_UNITS, SHOWCASE_BADGES } from '@printbi/shared';
import { model, Schema, type InferSchemaType } from 'mongoose';
import { imageSchema } from '../../core/db-schemas/image.schema';
import { microField, moneySchema } from '../../core/db-schemas/money.schema';
import { tenantScope } from '../../core/tenancy/tenant-scope.plugin';

const productSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    type: { type: String, enum: PRODUCT_TYPES, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    labelIds: { type: [Schema.Types.ObjectId], default: [] },
    price: { type: moneySchema, default: null },
    estimatedCost: { type: moneySchema, default: null },
    saleUnit: { type: String, enum: SALE_UNITS, default: 'unit' },
    customUnit: { type: String, default: '' },
    specs: {
      widthMm: { type: Number, default: null },
      depthMm: { type: Number, default: null },
      heightMm: { type: Number, default: null },
      filamentGrams: { ...microField(false), default: null },
    },
    notes: { type: String, default: '' },
    /** Display order; the first is the cover. At most 8. */
    images: { type: [imageSchema], default: [] },
    showcase: {
      visible: { type: Boolean, default: false },
      badge: { type: String, enum: SHOWCASE_BADGES, default: 'made_to_order' },
      showPrice: { type: Boolean, default: false },
      featured: { type: Boolean, default: false },
      order: { type: Number, default: 0 },
      slug: { type: String, default: null },
      collections: { type: [{ type: String, enum: COLLECTION_KEYS }], default: [] },
    },
    archivedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

productSchema.index({ companyId: 1, archivedAt: 1, name: 1 });
productSchema.index({ companyId: 1, labelIds: 1 });
productSchema.index({ companyId: 1, 'showcase.visible': 1, 'showcase.order': 1 });
productSchema.index({ companyId: 1, 'showcase.collections': 1 });
productSchema.index(
  { companyId: 1, 'showcase.slug': 1 },
  { unique: true, partialFilterExpression: { 'showcase.slug': { $type: 'string' } } },
);
productSchema.plugin(tenantScope);

export type Product = InferSchemaType<typeof productSchema>;
export const ProductModel = model('Product', productSchema);
