import { model, Schema } from 'mongoose';

/** Shared reference data (no companyId): filament products from the bundled catalog. */
const filamentProductSchema = new Schema(
  {
    slug: { type: String, required: true },
    brand: { type: String, required: true },
    product: { type: String, required: true },
    type: { type: String, required: true },
    diameterMm: { type: Number, default: null },
    densityGcm3: { type: Number, default: null },
    nozzleTempMin: { type: Number, default: null },
    nozzleTempMax: { type: Number, default: null },
    bedTempMin: { type: Number, default: null },
    bedTempMax: { type: Number, default: null },
    priceEurPerKg: { type: Number, default: null },
    catalogCommit: { type: String, required: true },
  },
  { versionKey: false },
);

filamentProductSchema.index({ slug: 1 }, { unique: true });

export const FilamentProductModel = model('FilamentProduct', filamentProductSchema);
