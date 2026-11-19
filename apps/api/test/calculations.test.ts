import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { addEmployee, newKey, registerWithCompany, type TestClient } from './client';
import { connectTestDatabase } from './memory-db';

const app = createApp();
let teardown: () => Promise<void>;

beforeAll(async () => {
  teardown = await connectTestDatabase();
});
afterAll(async () => teardown());

const M = 1_000_000;
const CAD = (amount: string) => ({ amount, currency: 'CAD' });

/** A calculation body with everything off; tests switch on what they check. */
function body(extra: Record<string, unknown> = {}, input: Record<string, unknown> = {}) {
  return {
    name: 'Dragon keychain',
    productId: null,
    notes: '',
    updateProductCost: false,
    ...extra,
    input: {
      currency: 'CAD',
      quantity: 1,
      basis: 'unit',
      printMinutes: 0,
      filament: { enabled: false, lines: [] },
      energy: { enabled: false, watts: '0', pricePerKwh: CAD('0') },
      labor: { enabled: false, lines: [] },
      machine: {
        enabled: false,
        mode: 'rate',
        printerId: null,
        label: '',
        ratePerHour: null,
        recovery: null,
      },
      materials: { enabled: false, lines: [] },
      risk: { enabled: false, percent: '0', base: 'total' },
      fees: { enabled: false, lines: [] },
      pricing: { method: 'manual', percent: '0', unitPrice: '0' },
      brlPerCad: null,
      ...input,
    },
  };
}

/** A filament roll of 1000 g bought for CAD 25 (CAD 0.025/g). */
async function roll(client: TestClient) {
  const res = await client.post(
    '/api/v1/inventory/items',
    {
      item: {
        kind: 'filament',
        name: 'PLA Black',
        filament: {
          materialType: 'PLA',
          brand: 'Bambu Lab',
          colorKey: 'black',
          colorName: 'Black',
        },
      },
      firstLot: { originalQuantity: '1000', remaining: '1000', totalCost: CAD('25') },
    },
    { 'Idempotency-Key': newKey() },
  );
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return { itemId: res.body.id as string, lotId: res.body.lots[0].id as string };
}

const stockLine = (
  ids: { itemId: string; lotId: string },
  grams: string,
  costPerGram = '9.99',
) => ({
  source: 'stock',
  ...ids,
  label: '',
  grams,
  // Whatever the page sends, the server uses the roll's own cost.
  costPerGram: CAD(costPerGram),
  spoolGrams: null,
  spoolPrice: null,
  available: null,
});

describe('saved calculations', () => {
  it('works out the result on the server from the roll’s real cost and stock', async () => {
    const { client } = await registerWithCompany(app);
    const ids = await roll(client);
    const res = await client.post(
      '/api/v1/calculations',
      body(
        {},
        {
          quantity: 10,
          basis: 'batch',
          printMinutes: 240,
          filament: { enabled: true, lines: [stockLine(ids, '100')] },
          pricing: { method: 'markup', percent: '100', unitPrice: '0' },
        },
      ),
    );
    expect(res.status).toBe(201);
    expect(res.body.input.filament.lines[0]).toMatchObject({
      costPerGram: { amount: 0.025 * M, currency: 'CAD' },
      available: 1000 * M,
      label: 'PLA Black · Roll 1',
    });
    expect(res.body.result.batchCost).toBe(2.5 * M);
    expect(res.body.unitCost).toBe(0.25 * M);
    expect(res.body.unitPrice).toBe(0.5 * M);
  });

  it('uses the picked printer’s recovery plan for the machine rate', async () => {
    const { client } = await registerWithCompany(app);
    const printer = await client.post('/api/v1/companies/current/printers', {
      name: 'P1S',
      purchaseCost: CAD('600'),
      costPerHour: null,
      recovery: {
        years: '2',
        daysPerYear: '300',
        hoursPerDay: '8',
        maintenance: { kind: 'percent', percent: '20' },
      },
    });
    expect(printer.status).toBe(201);
    const res = await client.post(
      '/api/v1/calculations',
      body(
        {},
        {
          printMinutes: 240,
          machine: {
            enabled: true,
            mode: 'printer',
            printerId: printer.body.id,
            label: '',
            ratePerHour: null,
            recovery: null,
          },
        },
      ),
    );
    expect(res.body.result.machineRate).toBe(0.15 * M);
    expect(res.body.result.sections.machine).toBe(0.6 * M);
    expect(res.body.input.machine.label).toBe('P1S');
  });

  it('refuses mixed currencies until the CAD/BRL rate is set, then converts', async () => {
    const { client } = await registerWithCompany(app);
    const brlLine = {
      source: 'manual',
      itemId: null,
      lotId: null,
      label: 'Magnets',
      quantity: '1',
      unitPrice: { amount: '40', currency: 'BRL' },
      available: null,
    };
    const input = { materials: { enabled: true, lines: [brlLine] } };
    const refused = await client.post('/api/v1/calculations', body({}, input));
    expect(refused.status).toBe(400);
    expect(refused.body.message).toContain('Settings');

    await client.patch('/api/v1/companies/current/settings', {
      currency: { defaultCurrency: 'CAD', brlPerCad: '4' },
    });
    const saved = await client.post('/api/v1/calculations', body({}, input));
    expect(saved.status).toBe(201);
    expect(saved.body.result.sections.materials).toBe(10 * M);
    expect(saved.body.input.brlPerCad).toBe(4 * M);
  });

  it('can write the unit cost into the product’s estimated cost', async () => {
    const { client } = await registerWithCompany(app);
    const product = (
      await client.post('/api/v1/products', { type: 'product', name: 'Dragon', labelIds: [] })
    ).body;
    const line = {
      source: 'manual',
      itemId: null,
      lotId: null,
      label: 'Paint',
      quantity: '1',
      unitPrice: CAD('3.456'),
      available: null,
    };
    await client.post(
      '/api/v1/calculations',
      body(
        { productId: product.id, updateProductCost: true },
        { materials: { enabled: true, lines: [line] } },
      ),
    );
    const updated = await client.get(`/api/v1/products/${product.id}`);
    expect(updated.body.estimatedCost).toEqual({ amount: 3.46 * M, currency: 'CAD' });
  });

  it('lists, opens, updates and deletes calculations', async () => {
    const { client } = await registerWithCompany(app);
    const created = (await client.post('/api/v1/calculations', body())).body;
    const updated = await client.put(`/api/v1/calculations/${created.id}`, body({ name: 'Bust' }));
    expect(updated.body.name).toBe('Bust');
    const list = await client.get('/api/v1/calculations?q=bus');
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(['Bust']);
    expect(list.body[0]).not.toHaveProperty('input');
    expect((await client.delete(`/api/v1/calculations/${created.id}`)).status).toBe(204);
    expect((await client.get(`/api/v1/calculations/${created.id}`)).status).toBe(404);
  });

  it('needs financial access, and never reads another business’s stock', async () => {
    const { client } = await registerWithCompany(app);
    const plain = await addEmployee(app, client, false);
    const finance = await addEmployee(app, client, true);
    expect((await plain.client.get('/api/v1/calculations')).status).toBe(403);
    expect((await finance.client.post('/api/v1/calculations', body())).status).toBe(201);

    const ids = await roll(client);
    const other = await registerWithCompany(app, 'Other');
    const res = await other.client.post(
      '/api/v1/calculations',
      body({}, { filament: { enabled: true, lines: [stockLine(ids, '10')] } }),
    );
    expect(res.status).toBe(400);
  });
});
