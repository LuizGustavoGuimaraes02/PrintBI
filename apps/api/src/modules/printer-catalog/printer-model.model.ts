import { model, Schema, type InferSchemaType } from 'mongoose';

const dimensions = new Schema({ x: Number, y: Number, z: Number }, { _id: false });

/**
 * Shared reference data, the same for every company (no companyId, so no tenant scope).
 * Filled from data/printer-models.json; never edited through the API.
 */
const printerModelSchema = new Schema(
  {
    slug: { type: String, required: true },
    brand: { type: String, required: true },
    model: { type: String, required: true },
    buildVolumeMm: { type: dimensions, default: null },
    buildVolumeCm3: { type: Number, default: null },
    nozzleDiameterMm: { type: Number, default: null },
    maxSpeedMmS: { type: Number, default: null },
    ratedPowerW: { type: Number, default: null },
    heaterPowerW: { type: Number, default: null },
    typicalNozzleTempC: { type: Number, default: null },
    typicalBedTempC: { type: Number, default: null },
    typicalPriceEur: { type: Number, default: null },
    maintenanceEurPerYear: { type: Number, default: null },
    /** Source commit of this record: lets startup know whether the catalog is current. */
    catalogCommit: { type: String, required: true },
  },
  { versionKey: false },
);

printerModelSchema.index({ slug: 1 }, { unique: true });

export type PrinterModel = InferSchemaType<typeof printerModelSchema>;
export const PrinterModelModel = model('PrinterModel', printerModelSchema);
