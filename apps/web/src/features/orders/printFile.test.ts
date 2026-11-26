// @vitest-environment node
import type { PrinterView } from '@printbi/shared';
import { describe, expect, it } from 'vitest';
import {
  colorName,
  durationMinutes,
  matchPrinter,
  PrintFileError,
  readPrintFile,
  titleFromFileName,
  type ByteSource,
} from './printFile';

const encoder = new TextEncoder();
const bytes = (value: string | Uint8Array) =>
  typeof value === 'string' ? encoder.encode(value) : value;

const source = (data: Uint8Array): ByteSource => ({
  size: data.length,
  read: async (start, end) => data.slice(start, end),
});

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(data as Uint8Array<ArrayBuffer>);
      controller.close();
    },
  }).pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A minimal zip writer (no CRC: the reader never checks it). */
async function zip(files: Record<string, string | Uint8Array>, store = false) {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = bytes(content);
    const data = store ? raw : await deflate(raw);
    const nameBytes = encoder.encode(name);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(8, store ? 0 : 8, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, raw.length, true);
    l.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(10, store ? 0 : 8, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, raw.length, true);
    c.setUint16(28, nameBytes.length, true);
    c.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, centrals.length, true);
  e.setUint16(10, centrals.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

describe('reading a Bambu Studio / OrcaSlicer 3MF', () => {
  it('fills time, grams, material, color, printer, copies and the plate image', async () => {
    const file = await zip({
      'Metadata/slice_info.config': `<?xml version="1.0"?><config><header/>
        <plate>
          <metadata key="index" value="1"/>
          <metadata key="printer_model_id" value="C12"/>
          <metadata key="prediction" value="9600"/>
          <metadata key="weight" value="86.12"/>
          ${'<object identify_id="1" name="phone-stand.stl" skipped="false" />'.repeat(5)}
          <filament id="1" type="PLA" color="#000000" used_m="28.9" used_g="86.12" />
        </plate></config>`,
      'Metadata/project_settings.config': JSON.stringify({
        printer_model: 'Bambu Lab P1S',
        filament_type: ['PLA', 'PETG'],
        filament_colour: ['#000000', '#FFFFFF'],
        filament_settings_id: ['Bambu PLA Matte @BBL P1S', 'Generic PETG'],
      }),
      'Metadata/plate_1.png': PNG,
      'Metadata/plate_1_small.png': new Uint8Array([9]),
    });
    const info = await readPrintFile('phone-stand.gcode.3mf', source(file));
    expect(info).toMatchObject({
      kind: '3mf',
      title: 'Phone stand',
      printerModel: 'Bambu Lab P1S',
      material: 'PLA Matte',
      colors: 'Jet Black',
      objects: 5,
      copies: 5,
      plates: 1,
      minutes: 160,
      grams: 86.1,
      gramsEstimated: false,
    });
    expect(info.thumbnail?.bytes).toEqual(PNG);
  });

  it('reads a project saved before slicing: title and parts, no time or grams', async () => {
    const file = await zip(
      {
        '3D/3dmodel.model': `<model><metadata name="Title">Desk &amp; cable clip</metadata>
          <resources/><build><item objectid="1"/><item objectid="2"/></build></model>`,
        'Metadata/slice_info.config':
          '<config><plate><metadata key="index" value="1"/></plate></config>',
      },
      true,
    );
    const info = await readPrintFile('Untitled.3mf', source(file));
    expect(info).toMatchObject({
      title: 'Desk & cable clip',
      objects: 2,
      plates: 0,
      minutes: null,
      grams: null,
    });
  });

  it('refuses a file that is not a zip', async () => {
    await expect(readPrintFile('broken.3mf', source(bytes('not a zip')))).rejects.toThrow(
      PrintFileError,
    );
  });
});

describe('reading G-code', () => {
  it('reads PrusaSlicer values from the closing config block of a large file', async () => {
    const head = [
      '; generated by PrusaSlicer 2.8.1',
      '; thumbnail begin 16x16 12',
      `; ${btoa(String.fromCharCode(...PNG))}`,
      '; thumbnail end',
      'G28',
    ].join('\n');
    const tail = [
      '; filament used [mm] = 4140.2',
      '; filament used [g] = 12.34',
      '; estimated printing time (normal mode) = 1h 5m 30s',
      '; filament_colour = #FF8000',
      '; filament_settings_id = "Prusament PETG"',
      '; filament_type = PETG',
      '; objects_info = {"objects":[{"name":"bracket.stl id:0 copy 0"},{"name":"bracket.stl id:0 copy 1"}]}',
      '; printer_model = MK4S',
    ].join('\n');
    const file = bytes(`${head}\n${'G1 X1 Y1 E0.1\n'.repeat(160_000)}${tail}\n`);
    expect(file.length).toBeGreaterThan(2 * 1024 * 1024);
    const info = await readPrintFile('bracket_0.2mm_PETG_MK4S_1h5m.gcode', source(file));
    expect(info).toMatchObject({
      kind: 'gcode',
      title: 'Bracket',
      printerModel: 'MK4S',
      material: 'PETG',
      objects: 2,
      copies: 2,
      minutes: 66,
      grams: 12.3,
      gramsEstimated: false,
    });
    expect(info.colors).toMatch(/Orange/);
    expect(info.thumbnail).toEqual({ type: 'image/png', bytes: PNG });
  });

  it('keeps only the filaments a multi-material print uses', async () => {
    const file = bytes(
      [
        '; HEADER_BLOCK_START',
        '; model printing time: 50m 10s; total estimated time: 55m 2s',
        '; total filament weight [g] : 50.00',
        '; HEADER_BLOCK_END',
        '; filament used [g] = 50.00, 0.00',
        '; filament_type = PLA;PETG',
        '; filament_colour = #FFFFFF;#000000',
        '; printer_model = Bambu Lab A1',
      ].join('\n'),
    );
    const info = await readPrintFile('clip.gcode', source(file));
    expect(info).toMatchObject({ minutes: 55, grams: 50, material: 'PLA', colors: 'White' });
  });

  it('estimates grams from Cura’s filament length and counts different parts', async () => {
    const file = bytes(
      [
        ';FLAVOR:Marlin',
        ';TIME:6000',
        ';Filament used: 2.5m',
        ';TARGET_MACHINE.NAME:Creality Ender-3',
        ';MESH:lid.stl',
        ';MESH:NONMESH',
        ';MESH:box.stl',
        ';MESH:lid.stl',
      ].join('\n'),
    );
    const info = await readPrintFile('box_and_lid.gcode', source(file));
    expect(info).toMatchObject({
      title: 'Box and lid',
      printerModel: 'Creality Ender-3',
      minutes: 100,
      grams: 7.5,
      gramsEstimated: true,
      objects: 2,
      copies: null,
    });
  });

  it('refuses other files', async () => {
    await expect(readPrintFile('model.stl', source(bytes('solid')))).rejects.toThrow(
      PrintFileError,
    );
  });
});

describe('helpers', () => {
  it('turns slicer durations into minutes', () => {
    expect(durationMinutes('2h 40m 1s')).toBe(160);
    expect(durationMinutes('1d 1h 0m 0s')).toBe(1500);
    expect(durationMinutes('45s')).toBe(1);
    expect(durationMinutes('')).toBeNull();
  });

  it('cleans slicer file names into titles', () => {
    expect(titleFromFileName('phone-stand_0.2mm_PLA_MK4S_2h40m.gcode')).toBe('Phone stand');
    expect(titleFromFileName('Spice rack_plate_2.gcode.3mf')).toBe('Spice rack');
    expect(titleFromFileName('keychain_x10.3mf')).toBe('Keychain x10');
  });

  it('names slicer colors from the catalog', () => {
    expect(colorName('#FFFFFF')).toBe('White');
    expect(colorName('#C8102EFF')).toBe('Red');
    expect(colorName('nope')).toBe('');
  });

  it('matches the slicer printer to a company printer', () => {
    const printer = (id: string, brand: string, model: string, status = 'active') =>
      ({ id, name: `${model} #1`, brand, model, status }) as PrinterView;
    const printers = [
      printer('p1p', 'Bambu Lab', 'P1P'),
      printer('old', 'Bambu Lab', 'P1S', 'retired'),
      printer('p1s', 'Bambu Lab', 'P1S'),
      printer('mk4', 'Prusa', 'MK4'),
    ];
    expect(matchPrinter('Bambu Lab P1S', printers)).toBe('p1s');
    expect(matchPrinter('MK4S', printers)).toBe('mk4');
    expect(matchPrinter('Creality Ender-3', printers)).toBe('');
    expect(matchPrinter('', printers)).toBe('');
    const named = [
      { id: 'a', name: 'Bambu P1S', brand: '', model: '', status: 'active' },
      { id: 'b', name: 'Ender 3 V3', brand: '', model: '', status: 'active' },
    ] as PrinterView[];
    expect(matchPrinter('Bambu Lab P1S', named)).toBe('a');
    expect(matchPrinter('Creality Ender-3 V3', named)).toBe('b');
    expect(matchPrinter('Bambu Lab A1 mini', named)).toBe('');
  });
});
