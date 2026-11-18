/**
 * Builds data/printer-models.json from a local clone of the Open 3D Printer Database.
 *
 *   git clone --depth 1 https://github.com/swordlab/open-3d-printer-database.git <dir>
 *   npm run catalog:printers -w @printbi/api -- <dir>
 *
 * Only FDM printers and only the fields PrintBI uses are kept. The output is committed,
 * so deploys and tests never depend on the network.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  filledFields,
  normalizePrinter,
  type CatalogPrinter,
} from '../src/modules/printer-catalog/normalize';

const sourceDir = process.argv[2];
if (!sourceDir) {
  process.stderr.write('Usage: build-printer-catalog <path to open-3d-printer-database clone>\n');
  process.exit(1);
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsonFiles(path);
    return name.endsWith('.json') ? [path] : [];
  });
}

const bySlug = new Map<string, CatalogPrinter>();
for (const file of jsonFiles(resolve(sourceDir, 'printers', 'fdm'))) {
  const printer = normalizePrinter(JSON.parse(readFileSync(file, 'utf8')));
  if (!printer) continue;
  const existing = bySlug.get(printer.slug);
  if (!existing || filledFields(printer) > filledFields(existing))
    bySlug.set(printer.slug, printer);
}

// Data from git only (read-only command, no shell): the commit the catalog was built from.
const commit = execFileSync('git', ['-C', sourceDir, 'rev-parse', '--short', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const printers = [...bySlug.values()].sort(
  (a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model),
);

const output = {
  source: 'https://github.com/swordlab/open-3d-printer-database',
  commit,
  license: 'CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/)',
  changes: 'FDM printers only; brand names normalized; only the fields PrintBI uses are kept.',
  printers,
};
const target = resolve(import.meta.dirname, '..', 'data', 'printer-models.json');
writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`Wrote ${printers.length} printers from ${commit} to ${target}\n`);
