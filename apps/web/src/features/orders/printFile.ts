import { FILAMENT_COLORS, type PrinterView } from '@printbi/shared';

/**
 * Reads what a slicer wrote into a print file, in the browser: nothing is uploaded or kept.
 * - .3mf from Bambu Studio / OrcaSlicer: time, grams, material, color, printer, objects, plate image.
 *   A project saved before slicing has no time or grams; PrusaSlicer projects give the settings.
 * - .gcode from PrusaSlicer, OrcaSlicer, Bambu Studio, Cura and Simplify3D: whatever the header
 *   and the closing config block say.
 * Every value is an estimate for planning. Stock only changes when usage is recorded.
 */
export interface PrintFileInfo {
  fileName: string;
  kind: '3mf' | 'gcode';
  title: string;
  /** The printer as the slicer names it, such as "Bambu Lab P1S"; empty when unknown. */
  printerModel: string;
  material: string;
  colors: string;
  /** Parts on the plate(s); null when the file does not say. */
  objects: number | null;
  /** Set when every part is the same model, so the parts are copies of one item. */
  copies: number | null;
  plates: number;
  minutes: number | null;
  grams: number | null;
  /** True when grams came from filament length rather than the slicer's own weight. */
  gramsEstimated: boolean;
  thumbnail: { type: string; bytes: Uint8Array } | null;
}

export class PrintFileError extends Error {}

/** Random access to the file, so a 200 MB G-code is never read whole. */
export interface ByteSource {
  size: number;
  read(start: number, end: number): Promise<Uint8Array>;
}

export const blobSource = (blob: Blob): ByteSource => ({
  size: blob.size,
  read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()),
});

export const SUPPORTED_EXTENSIONS = ['.3mf', '.gcode', '.gco', '.g'] as const;

export function printFileKind(name: string): '3mf' | 'gcode' | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.3mf')) return '3mf';
  if (lower.endsWith('.gcode') || lower.endsWith('.gco') || lower.endsWith('.g')) return 'gcode';
  return null;
}

export async function readPrintFile(name: string, source: ByteSource): Promise<PrintFileInfo> {
  const kind = printFileKind(name);
  if (!kind) throw new PrintFileError('Use a .3mf or .gcode file from your slicer.');
  const found = kind === '3mf' ? await read3mf(source) : await readGcode(source);
  const base = titleFromFileName(name);
  const names = found.objectNames.map(baseObjectName).filter(Boolean);
  const same = names.length > 0 && names.every((n) => n === names[0]);
  const generic = !base || /^(untitled|plate|project|model|output)\b/i.test(base);
  return {
    fileName: name,
    kind,
    title: found.title || (generic && same ? humanize(names[0]!) : base) || 'Print job',
    printerModel: found.printerModel,
    material: found.material,
    colors: found.colors,
    objects: found.objects ?? (names.length || null),
    copies: same && names.length > 1 ? names.length : null,
    plates: found.plates,
    minutes: found.minutes,
    grams: found.grams === null ? null : Math.round(found.grams * 10) / 10,
    gramsEstimated: found.gramsEstimated,
    thumbnail: found.thumbnail,
  };
}

interface Found {
  title: string;
  printerModel: string;
  material: string;
  colors: string;
  objects: number | null;
  objectNames: string[];
  plates: number;
  minutes: number | null;
  grams: number | null;
  gramsEstimated: boolean;
  thumbnail: PrintFileInfo['thumbnail'];
}

const nothing = (): Found => ({
  title: '',
  printerModel: '',
  material: '',
  colors: '',
  objects: null,
  objectNames: [],
  plates: 0,
  minutes: null,
  grams: null,
  gramsEstimated: false,
  thumbnail: null,
});

/* ----------------------------- names and values ----------------------------- */

const humanize = (value: string) => {
  const text = value
    .replace(/[_]+/g, ' ')
    .replace(/(?<=\S)-(?=\S)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text[0]!.toUpperCase() + text.slice(1) : '';
};

/** "phone-stand_0.2mm_PLA_MK4S_2h40m.gcode" becomes "Phone stand". */
export function titleFromFileName(name: string): string {
  const base = name
    .replace(/\.(gcode\.3mf|3mf|gcode|gco|g)$/i, '')
    .replace(/[_ ]plate[_ ]?\d+$/i, '')
    .split(/[_ ]/)
    .filter(
      (part) =>
        !/^\d+(\.\d+)?mm$/i.test(part) &&
        !/^(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/i.test(part) &&
        !/^(PLA|PETG|ABS|ASA|TPU|PA|PC|PVA|HIPS|PLA\+|PETG\+|CF)$/i.test(part) &&
        !/^(MK\d\S*|MINI\S*|XL\S*|CORE\S*|P1[PS]|X1C?|X1E|A1|A1M|A1MINI|H2D|ENDER\S*|K1\S*)$/i.test(
          part,
        ),
    )
    .join('_');
  return humanize(base);
}

/** One model's parts share a base name: "Stand.stl id:0 copy 2", "stand_stl_id_1_copy_0", "stand(1)". */
function baseObjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_]*id[:_]?\d+[\s_]*copy[\s_]*\d+$/, '')
    .replace(/[\s_]*copy[\s_]*\d+$/, '')
    .replace(/\s*\(\d+\)$/, '')
    .replace(/[._](stl|3mf|obj|step|stp)$/, '')
    .trim();
}

/** "1d 2h 40m 5s", "2h 40m", "40m 12s" in minutes, rounded. */
export function durationMinutes(text: string): number | null {
  const part = (unit: string) => Number(new RegExp(`(\\d+)\\s*${unit}`).exec(text)?.[1] ?? 0);
  const seconds = part('d') * 86400 + part('h') * 3600 + part('m(?!s)') * 60 + part('s');
  return seconds > 0 ? Math.round(seconds / 60) : null;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const numbers = (text: string) =>
  text
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter(Boolean)
    .map(Number)
    .filter((v) => Number.isFinite(v));
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

const SOLID = FILAMENT_COLORS.filter((c) => c.finish === 'basic' && c.stops.length === 1);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The closest plain color name for a slicer's hex value ("#000000" is "Jet Black"). */
export function colorName(hex: string): string {
  const clean = /^#?[0-9a-f]{6}/i.exec(hex.trim())?.[0];
  if (!clean) return '';
  const [r, g, b] = rgb(clean.startsWith('#') ? clean : `#${clean}`) as [number, number, number];
  let best = '';
  let bestDistance = Infinity;
  for (const color of SOLID) {
    const [cr, cg, cb] = rgb(color.stops[0]!) as [number, number, number];
    // Weighted for the eye: green differences show the most, blue the least.
    const d = 2 * (r - cr) ** 2 + 4 * (g - cg) ** 2 + 3 * (b - cb) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = color.name;
    }
  }
  return best;
}

/** "Bambu PLA Matte @BBL P1S" with type PLA reads as "PLA Matte". */
function materialName(type: string, settingsId: string): string {
  const settings = settingsId
    .replace(/^"|"$/g, '')
    .replace(/\s*@.*$/, '')
    .trim();
  if (type && settings) {
    const at = settings.toUpperCase().indexOf(type.toUpperCase());
    if (at >= 0) return settings.slice(at).trim();
  }
  return type || settings;
}

const BAMBU_MODELS: Record<string, string> = {
  'BL-P001': 'X1 Carbon',
  'BL-P002': 'X1',
  C11: 'P1P',
  C12: 'P1S',
  C13: 'X1E',
  N1: 'A1 mini',
  N2S: 'A1',
};

/* ---------------------------------- .3mf ---------------------------------- */

const decoder = new TextDecoder();
const decodeXml = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
const attr = (tag: string, name: string) =>
  decodeXml(new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? '');

async function read3mf(source: ByteSource): Promise<Found> {
  const entries = await zipEntries(source);
  const byName = new Map(entries.map((e) => [e.name.toLowerCase(), e]));
  const text = async (name: string, limit = 32 * 1024 * 1024) => {
    const entry = byName.get(name);
    return entry && entry.size <= limit ? decoder.decode(await zipRead(source, entry)) : '';
  };
  const found = nothing();

  // Settings: Bambu/Orca keep JSON, PrusaSlicer keeps "; key = value" lines.
  const project = await text('metadata/project_settings.config');
  let settings: Record<string, unknown> = {};
  if (project.trimStart().startsWith('{')) {
    try {
      settings = JSON.parse(project) as Record<string, unknown>;
    } catch {
      settings = {};
    }
  } else {
    settings = iniFields(project || (await text('metadata/slic3r_pe.config')));
  }
  const list = (key: string) => {
    const value = settings[key];
    if (Array.isArray(value)) return value.map(String);
    return typeof value === 'string' ? value.split(';').map((v) => v.trim()) : [];
  };
  found.printerModel = String(settings.printer_model ?? '') || list('printer_settings_id')[0] || '';
  let filaments = list('filament_type').map((type, i) => ({
    type,
    color: list('filament_colour')[i] ?? '',
    settings: list('filament_settings_id')[i] ?? '',
  }));

  // What was sliced: per plate time, weight, parts and the filaments it really uses.
  const slice = await text('metadata/slice_info.config');
  const plates = [...slice.matchAll(/<plate>([\s\S]*?)<\/plate>/g)].map((m) => m[1]!);
  let firstPlate = 1;
  if (plates.length > 0) {
    const meta = (plate: string, key: string) =>
      new RegExp(`<metadata key="${key}" value="([^"]*)"`).exec(plate)?.[1] ?? '';
    const sliced = plates.filter((p) => Number(meta(p, 'prediction')) > 0);
    firstPlate = Number(meta(sliced[0] ?? plates[0]!, 'index')) || 1;
    found.plates = sliced.length;
    if (sliced.length > 0) {
      found.minutes = Math.round(sum(sliced.map((p) => Number(meta(p, 'prediction')))) / 60);
      const used = sliced.flatMap((p) => [...p.matchAll(/<filament\b[^>]*>/g)].map((m) => m[0]));
      const weight = sum(sliced.map((p) => Number(meta(p, 'weight')) || 0));
      found.grams = weight || sum(used.map((f) => Number(attr(f, 'used_g')) || 0)) || null;
      const objects = sliced.flatMap((p) =>
        [...p.matchAll(/<object\b[^>]*>/g)]
          .map((m) => m[0])
          .filter((o) => attr(o, 'skipped') !== 'true'),
      );
      found.objectNames = objects.map((o) => attr(o, 'name'));
      found.objects = objects.length || null;
      if (used.length > 0) {
        filaments = used.map((f) => {
          const index = Number(attr(f, 'id')) - 1;
          return {
            type: attr(f, 'type') || filaments[index]?.type || '',
            color: attr(f, 'color') || filaments[index]?.color || '',
            settings: filaments[index]?.settings ?? '',
          };
        });
      }
    }
    const modelId = meta(plates[0]!, 'printer_model_id');
    if (!found.printerModel && BAMBU_MODELS[modelId]) {
      found.printerModel = `Bambu Lab ${BAMBU_MODELS[modelId]}`;
    }
  }
  found.material = unique(filaments.map((f) => materialName(f.type, f.settings))).join(', ');
  found.colors = unique(filaments.map((f) => colorName(f.color))).join(', ');

  // The model: its title and, when nothing was sliced, how many parts sit on the build plate.
  const model = await text('3d/3dmodel.model', 16 * 1024 * 1024);
  found.title = decodeXml(
    /<metadata name="Title">([^<]*)<\/metadata>/.exec(model)?.[1] ?? '',
  ).trim();
  if (found.objects === null) {
    const build = /<build\b[^>]*>([\s\S]*?)<\/build>/.exec(model)?.[1] ?? '';
    const prusa = await text('metadata/slic3r_pe_model.config');
    const instances = sum(
      [...prusa.matchAll(/<object\b[^>]*instances_count="(\d+)"/g)].map((m) => Number(m[1])),
    );
    found.objects = instances || (build.match(/<item\b/g) ?? []).length || null;
  }

  const image =
    byName.get(`metadata/plate_${firstPlate}.png`) ??
    byName.get('metadata/thumbnail.png') ??
    entries.find((e) => /^metadata\/plate_\d+\.png$/i.test(e.name));
  if (image && image.size < 8 * 1024 * 1024) {
    found.thumbnail = { type: 'image/png', bytes: await zipRead(source, image) };
  }
  return found;
}

function iniFields(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/^;\s*([\w ]+?)\s*=\s*(.*)$/gm)) {
    const key = m[1]!.trim();
    if (!(key in out)) out[key] = m[2]!.trim();
  }
  return out;
}

/* ---------------------------------- .gcode ---------------------------------- */

const CHUNK = 1024 * 1024;
/** 1 m of 1.75 mm PLA weighs about 2.98 g (1.24 g/cm³). */
const GRAMS_PER_METRE = 2.98;

async function readGcode(source: ByteSource): Promise<Found> {
  const headEnd = Math.min(source.size, CHUNK);
  const head = decoder.decode(await source.read(0, headEnd));
  const tail =
    source.size > headEnd
      ? decoder.decode(await source.read(Math.max(headEnd, source.size - CHUNK), source.size))
      : '';
  const all = `${head}\n${tail}`;
  const fields = { ...iniFields(tail), ...iniFields(head) };
  const first = (...patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const value = pattern.exec(all)?.[1];
      if (value !== undefined) return value.trim();
    }
    return '';
  };
  const found = nothing();

  const totalTime = first(
    /total estimated time:\s*([\dhdms ]+)/i,
    /estimated printing time \(normal mode\)\s*=\s*([\dhdms ]+)/i,
  );
  const seconds = first(/^;TIME:(\d+)/m, /^;PRINT\.TIME:(\d+)/m);
  const s3d = /Build time:\s*(\d+) hours?\s*(\d+) minutes?/i.exec(all);
  found.minutes = totalTime
    ? durationMinutes(totalTime)
    : seconds
      ? Math.round(Number(seconds) / 60)
      : s3d
        ? Number(s3d[1]) * 60 + Number(s3d[2])
        : null;

  const perFilament = numbers(first(/^;\s*filament used \[g\]\s*=\s*([\d., \t]+)$/m));
  const grams = first(
    /total filament (?:used|weight) \[g\]\s*[:=]\s*([\d.]+)/i,
    /Plastic weight:\s*([\d.]+)\s*g/i,
  );
  const metres = numbers(first(/^;Filament used:\s*([\d., \t]+)m/m));
  const mm = numbers(first(/^;\s*filament used \[mm\]\s*=\s*([\d., \t]+)$/m));
  if (grams) found.grams = Number(grams);
  else if (perFilament.length) found.grams = sum(perFilament);
  else if (metres.length || mm.length) {
    found.grams = (metres.length ? sum(metres) : sum(mm) / 1000) * GRAMS_PER_METRE;
    found.gramsEstimated = true;
  }

  // Multi-material printers list every loaded slot; keep the ones this print uses.
  const split = (value = '') => value.split(/[;,]/).map((v) => v.trim().replace(/^"|"$/g, ''));
  const types = split(fields.filament_type);
  const colours = split(fields.filament_colour);
  const settingIds = split(fields.filament_settings_id);
  const used = (i: number) => perFilament.length !== types.length || (perFilament[i] ?? 0) > 0;
  const slots = types.map((type, i) => ({ type, i })).filter(({ type, i }) => type && used(i));
  found.material = unique(slots.map(({ type, i }) => materialName(type, settingIds[i] ?? ''))).join(
    ', ',
  );
  found.colors = unique(slots.map(({ i }) => colorName(colours[i] ?? ''))).join(', ');

  found.printerModel =
    fields.printer_model ||
    first(/^;TARGET_MACHINE\.NAME:(.+)$/m) ||
    fields.printer_settings_id ||
    '';

  const info = fields.objects_info;
  if (info) {
    try {
      const parsed = JSON.parse(info) as { objects?: { name?: string }[] };
      found.objectNames = (parsed.objects ?? []).map((o) => o.name ?? '');
    } catch {
      /* not JSON: fall through to the other markers */
    }
  }
  if (found.objectNames.length === 0) {
    found.objectNames = [...head.matchAll(/^EXCLUDE_OBJECT_DEFINE NAME=['"]?([^\s'"]+)/gm)].map(
      (m) => m[1]!,
    );
  }
  if (found.objectNames.length === 0) {
    found.objectNames = unique(
      [...head.matchAll(/^;MESH:(.+)$/gm)].map((m) => m[1]!.trim()).filter((n) => n !== 'NONMESH'),
    );
  }
  found.objects = found.objectNames.length || null;
  found.plates = 1;
  found.thumbnail = gcodeThumbnail(head);
  return found;
}

/** The largest PNG or JPG preview the slicer embedded as base64 comment lines. */
function gcodeThumbnail(head: string): PrintFileInfo['thumbnail'] {
  let best: { area: number; type: string; data: string } | null = null;
  const pattern = /^; (thumbnail(?:_(PNG|JPG))?) begin (\d+)x(\d+) \d+\r?\n([\s\S]*?)^; \1 end/gm;
  for (const m of head.matchAll(pattern)) {
    const area = Number(m[3]) * Number(m[4]);
    if (!best || area > best.area) {
      best = { area, type: m[2] === 'JPG' ? 'image/jpeg' : 'image/png', data: m[5]! };
    }
  }
  if (!best) return null;
  try {
    const binary = atob(best.data.replace(/^;\s?/gm, '').replace(/\s+/g, ''));
    return { type: best.type, bytes: Uint8Array.from(binary, (c) => c.charCodeAt(0)) };
  } catch {
    return null;
  }
}

/* ----------------------------------- zip ----------------------------------- */

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const FULL32 = 0xffffffff;

/** Lists a zip's files from its central directory (zip64 included). */
async function zipEntries(source: ByteSource): Promise<ZipEntry[]> {
  const tailStart = Math.max(0, source.size - 65_557);
  const tail = await source.read(tailStart, source.size);
  const t = view(tail);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (t.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new PrintFileError('This .3mf file is damaged or not a 3MF.');
  let count = t.getUint16(eocd + 10, true);
  let cdSize = t.getUint32(eocd + 12, true);
  let cdOffset = t.getUint32(eocd + 16, true);
  if ((cdOffset === FULL32 || count === 0xffff) && eocd >= 20) {
    if (t.getUint32(eocd - 20, true) === 0x07064b50) {
      const at = Number(t.getBigUint64(eocd - 12, true));
      const z = view(await source.read(at, at + 56));
      if (z.getUint32(0, true) === 0x06064b50) {
        count = Number(z.getBigUint64(32, true));
        cdSize = Number(z.getBigUint64(40, true));
        cdOffset = Number(z.getBigUint64(48, true));
      }
    }
  }
  const cd = await source.read(cdOffset, cdOffset + cdSize);
  const c = view(cd);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.length; n++) {
    if (c.getUint32(p, true) !== 0x02014b50) break;
    const nameLength = c.getUint16(p + 28, true);
    const extraLength = c.getUint16(p + 30, true);
    const commentLength = c.getUint16(p + 32, true);
    const entry: ZipEntry = {
      method: c.getUint16(p + 10, true),
      compressedSize: c.getUint32(p + 20, true),
      size: c.getUint32(p + 24, true),
      offset: c.getUint32(p + 42, true),
      name: decoder.decode(cd.subarray(p + 46, p + 46 + nameLength)),
    };
    // Zip64 keeps the real values in an extra field, in this order, for those set to 0xFFFFFFFF.
    let e = p + 46 + nameLength;
    const extraEnd = e + extraLength;
    while (e + 4 <= extraEnd) {
      const id = c.getUint16(e, true);
      const length = c.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        const next = () => {
          const value = Number(c.getBigUint64(q, true));
          q += 8;
          return value;
        };
        if (entry.size === FULL32) entry.size = next();
        if (entry.compressedSize === FULL32) entry.compressedSize = next();
        if (entry.offset === FULL32) entry.offset = next();
      }
      e += 4 + length;
    }
    entries.push(entry);
    p = extraEnd + commentLength;
  }
  return entries;
}

async function zipRead(source: ByteSource, entry: ZipEntry): Promise<Uint8Array> {
  const header = view(await source.read(entry.offset, entry.offset + 30));
  if (header.getUint32(0, true) !== 0x04034b50) throw new PrintFileError('Damaged .3mf file.');
  const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  const data = await source.read(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new PrintFileError('This .3mf uses an unsupported compression.');
  return inflate(data);
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(data as Uint8Array<ArrayBuffer>);
      controller.close();
    },
  }).pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* --------------------------------- printers --------------------------------- */

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The company printer that matches the slicer's printer name, or '' when none does.
 * An exact model match beats a partial one; an active printer beats one in maintenance.
 */
export function matchPrinter(model: string, printers: PrinterView[]): string {
  const wanted = squash(model);
  if (!wanted) return '';
  let best = { id: '', score: 0 };
  for (const printer of printers) {
    if (printer.status === 'retired') continue;
    const names = [printer.model, `${printer.brand} ${printer.model}`, printer.name]
      .map(squash)
      .filter((n) => n.length >= 2);
    let score = 0;
    if (names.some((n) => n === wanted)) score = 4;
    else if (squash(printer.model).length >= 2 && wanted.endsWith(squash(printer.model))) score = 3;
    else if (names.some((n) => wanted.includes(n) || n.includes(wanted))) score = 2;
    // A printer saved by name only ("Bambu P1S", "Ender 3 V3"): its last model-like word.
    else if (
      printer.name
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 2 && /\d/.test(w))
        .some((w) => wanted.endsWith(w))
    ) {
      score = 1;
    }
    if (score > 0 && printer.status === 'active') score += 0.5;
    if (score > best.score) best = { id: printer.id, score };
  }
  return best.id;
}
