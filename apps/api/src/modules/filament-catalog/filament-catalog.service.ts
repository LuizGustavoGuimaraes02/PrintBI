import type { FilamentProductView } from '@printbi/shared';
import type { Types } from 'mongoose';
import catalog from '../../../data/filament-products.json' with { type: 'json' };
import { logger } from '../../core/logger';
import { FilamentProductModel } from './filament-product.model';
import type { CatalogFilament } from './normalize';

const filaments = catalog.filaments as CatalogFilament[];

/** Same strategy as the printer catalog: write only when the bundled catalog changed. */
export async function syncFilamentCatalog(): Promise<void> {
  const current = await FilamentProductModel.countDocuments({ catalogCommit: catalog.commit });
  if (current === filaments.length) return;
  await FilamentProductModel.bulkWrite(
    filaments.map((filament) => ({
      updateOne: {
        filter: { slug: filament.slug },
        update: { $set: { ...filament, catalogCommit: catalog.commit } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  logger.info({ filaments: filaments.length, commit: catalog.commit }, 'Filament catalog synced');
}

export async function listFilamentProducts(): Promise<FilamentProductView[]> {
  const rows = await FilamentProductModel.find({}, { slug: 0, catalogCommit: 0 })
    .sort({ brand: 1, product: 1 })
    .lean();
  return rows.map(({ _id, ...f }) => ({
    id: _id.toString(),
    brand: f.brand,
    product: f.product,
    type: f.type,
    diameterMm: f.diameterMm ?? null,
    densityGcm3: f.densityGcm3 ?? null,
    nozzleTempMin: f.nozzleTempMin ?? null,
    nozzleTempMax: f.nozzleTempMax ?? null,
    bedTempMin: f.bedTempMin ?? null,
    bedTempMax: f.bedTempMax ?? null,
    priceEurPerKg: f.priceEurPerKg ?? null,
  }));
}

export async function filamentProductExists(id: Types.ObjectId): Promise<boolean> {
  return Boolean(await FilamentProductModel.exists({ _id: id }));
}
