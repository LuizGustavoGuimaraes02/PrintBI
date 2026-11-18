/**
 * Builds data/filament-products.json from a local clone of the Open 3D Printer Database.
 *
 *   npm run catalog:filaments -w @printbi/api -- <path to clone>
 *
 * Only FDM filaments and the fields PrintBI uses are kept. The output is committed.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeFilament, type CatalogFilament } from '../src/modules/filament-catalog/normalize';

const sourceDir = process.argv[2];
if (!sourceDir) {
  process.stderr.write('Usage: build-filament-catalog <path to open-3d-printer-database clone>\n');
  process.exit(1);
}

const source = JSON.parse(
  readFileSync(resolve(sourceDir, 'materials_catalog.json'), 'utf8'),
) as unknown[];
const bySlug = new Map<string, CatalogFilament>();
for (const entry of source) {
  const filament = normalizeFilament(entry as Parameters<typeof normalizeFilament>[0]);
  if (filament && !bySlug.has(filament.slug)) bySlug.set(filament.slug, filament);
}

const commit = execFileSync('git', ['-C', sourceDir, 'rev-parse', '--short', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const filaments = [...bySlug.values()].sort(
  (a, b) => a.brand.localeCompare(b.brand) || a.product.localeCompare(b.product),
);

const target = resolve(import.meta.dirname, '..', 'data', 'filament-products.json');
writeFileSync(
  target,
  `${JSON.stringify(
    {
      source: 'https://github.com/swordlab/open-3d-printer-database',
      commit,
      license: 'CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/)',
      changes:
        'FDM filaments only; material types normalized; only the fields PrintBI uses are kept.',
      filaments,
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`Wrote ${filaments.length} filaments from ${commit} to ${target}\n`);
