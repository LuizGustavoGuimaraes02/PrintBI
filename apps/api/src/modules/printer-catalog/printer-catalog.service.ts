import type { PrinterModelView } from '@printbi/shared';
import type { Types } from 'mongoose';
import catalog from '../../../data/printer-models.json' with { type: 'json' };
import { logger } from '../../core/logger';
import type { CatalogPrinter } from './normalize';
import { PrinterModelModel } from './printer-model.model';

const printers = catalog.printers as CatalogPrinter[];

/**
 * Brings the printer catalog in the database up to date with the bundled JSON.
 * Idempotent and cheap: it only writes when the stored catalog is from another commit.
 * Models that disappear from the source are kept, because companies may reference them.
 */
export async function syncPrinterCatalog(): Promise<void> {
  const current = await PrinterModelModel.countDocuments({ catalogCommit: catalog.commit });
  if (current === printers.length) return;

  await PrinterModelModel.bulkWrite(
    printers.map((printer) => ({
      updateOne: {
        filter: { slug: printer.slug },
        update: { $set: { ...printer, catalogCommit: catalog.commit } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  logger.info({ printers: printers.length, commit: catalog.commit }, 'Printer catalog synced');
}

type ModelRecord = Omit<PrinterModelView, 'id' | 'fullName'> & { _id: Types.ObjectId };

const toView = ({ _id, ...m }: ModelRecord): PrinterModelView => ({
  id: _id.toString(),
  brand: m.brand,
  model: m.model,
  fullName: `${m.brand} ${m.model}`,
  buildVolumeMm: m.buildVolumeMm
    ? { x: m.buildVolumeMm.x, y: m.buildVolumeMm.y, z: m.buildVolumeMm.z }
    : null,
  buildVolumeCm3: m.buildVolumeCm3 ?? null,
  nozzleDiameterMm: m.nozzleDiameterMm ?? null,
  maxSpeedMmS: m.maxSpeedMmS ?? null,
  ratedPowerW: m.ratedPowerW ?? null,
  heaterPowerW: m.heaterPowerW ?? null,
  typicalNozzleTempC: m.typicalNozzleTempC ?? null,
  typicalBedTempC: m.typicalBedTempC ?? null,
  typicalPriceEur: m.typicalPriceEur ?? null,
  maintenanceEurPerYear: m.maintenanceEurPerYear ?? null,
});

/** The whole catalog (about 160 small records): the web app searches it locally. */
export async function listPrinterModels(): Promise<PrinterModelView[]> {
  const models = await PrinterModelModel.find({}, { slug: 0, catalogCommit: 0 })
    .sort({ brand: 1, model: 1 })
    .lean();
  return models.map((m) => toView(m as unknown as ModelRecord));
}

export async function printerModelExists(id: Types.ObjectId): Promise<boolean> {
  return Boolean(await PrinterModelModel.exists({ _id: id }));
}
