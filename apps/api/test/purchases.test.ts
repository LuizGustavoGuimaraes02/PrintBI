import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { ExpenseModel } from '../src/modules/expenses/expense.model';
import { InventoryItemModel } from '../src/modules/inventory/inventory.model';
import { addEmployee, newKey, registerWithCompany, type TestClient } from './client';
import { connectTestDatabase } from './memory-db';

const app = createApp();
let teardown: () => Promise<void>;

beforeAll(async () => {
  teardown = await connectTestDatabase();
});
afterAll(async () => teardown());

const G = 1_000_000;
const CAD = (amount: string) => ({ amount, currency: 'CAD' });

const plaBasic = (colorKey: string, colorName: string) => ({
  kind: 'filament',
  name: `Bambu Lab PLA Basic ${colorName}`,
  filament: { materialType: 'PLA', brand: 'Bambu Lab', colorKey, colorName },
});

const line = (colorKey: string, colorName: string, rolls = 1, extra: object = {}) => ({
  item: plaBasic(colorKey, colorName),
  rolls,
  originalQuantity: '1000',
  totalCost: CAD('20'),
  ...extra,
});

async function filamentCategory(client: TestClient) {
  const categories = (await client.get('/api/v1/companies/current/expense-categories')).body as {
    id: string;
    name: string;
  }[];
  return categories.find((c) => c.name === 'Filament')?.id ?? '';
}

const purchase = (client: TestClient, body: object, key = newKey()) =>
  client.post('/api/v1/inventory/purchases', body, { 'Idempotency-Key': key });

describe('multi-color purchases', () => {
  it('creates one item per color with the right number of rolls', async () => {
    const { client } = await registerWithCompany(app);
    const res = await purchase(client, {
      store: 'Bambu Lab store',
      purchasedAt: '2026-11-15',
      lines: [line('black', 'Black', 2), line('white', 'White'), line('hot-pink', 'Hot Pink')],
    });
    expect(res.status).toBe(201);
    const byName = Object.fromEntries(
      res.body.map((i: { name: string; lots: unknown[] }) => [i.name, i.lots.length]),
    );
    expect(byName).toEqual({
      'Bambu Lab PLA Basic Black': 2,
      'Bambu Lab PLA Basic White': 1,
      'Bambu Lab PLA Basic Hot Pink': 1,
    });
    const black = res.body.find((i: { name: string }) => i.name.endsWith('Black'));
    expect(black.lots.map((l: { label: string }) => l.label)).toEqual(['Roll 1', 'Roll 2']);
    expect(black.lots[0]).toMatchObject({
      remaining: 1000 * G,
      store: 'Bambu Lab store',
      unitCost: { amount: 20_000, currency: 'CAD' },
    });
  });

  it('adds rolls to a filament already in stock instead of duplicating it', async () => {
    const { client, companyId } = await registerWithCompany(app);
    await purchase(client, { lines: [line('black', 'Black')] });
    const res = await purchase(client, { lines: [line('black', 'Black', 3)] });
    expect(await InventoryItemModel.countDocuments({ companyId })).toBe(1);
    expect(res.body[0].lots.map((l: { label: string }) => l.label)).toEqual([
      'Roll 1',
      'Roll 2',
      'Roll 3',
      'Roll 4',
    ]);
  });

  it('records one expense for the whole order, linked to every roll', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const res = await purchase(client, {
      store: 'Amazon',
      lines: [line('black', 'Black', 2), line('white', 'White')],
      expense: {
        categoryId: await filamentCategory(client),
        paidAt: '2026-11-15',
        method: 'credit',
      },
    });
    expect(res.status).toBe(201);
    const expenses = await ExpenseModel.find({ companyId }).lean();
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({
      amount: { amount: 60 * G, currency: 'CAD' },
      status: 'paid',
      vendor: 'Amazon',
    });
    expect(expenses[0]?.stock).toHaveLength(3);

    const view = (await client.get(`/api/v1/expenses/${expenses[0]?._id}`)).body;
    expect(view.description).toBe('Filament order · 3 rolls');
    expect(view.stock.map((s: { lotLabel: string }) => s.lotLabel).sort()).toEqual([
      'Roll 1',
      'Roll 1',
      'Roll 2',
    ]);
  });

  it('is idempotent: a repeated submit adds nothing', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const key = newKey();
    const body = {
      lines: [line('black', 'Black', 2), line('white', 'White')],
      expense: { categoryId: await filamentCategory(client), paidAt: null },
    };
    await Promise.all([purchase(client, body, key), purchase(client, body, key)]);
    await purchase(client, body, key);
    const items = await InventoryItemModel.find({ companyId }).lean();
    expect(items.reduce((sum, i) => sum + i.lots.length, 0)).toBe(3);
    expect(await ExpenseModel.countDocuments({ companyId })).toBe(1);
  });

  it('refuses one expense across two currencies, or without prices', async () => {
    const { client } = await registerWithCompany(app);
    const categoryId = await filamentCategory(client);
    const mixed = await purchase(client, {
      lines: [
        line('black', 'Black'),
        line('white', 'White', 1, { totalCost: { amount: '80', currency: 'BRL' } }),
      ],
      expense: { categoryId },
    });
    expect(mixed.status).toBe(400);
    const unpriced = await purchase(client, {
      lines: [line('black', 'Black', 1, { totalCost: null })],
      expense: { categoryId },
    });
    expect(unpriced.status).toBe(400);
  });

  it('only members with financial access register filament, always with a price', async () => {
    const admin = await registerWithCompany(app);
    const employee = await addEmployee(app, admin.client, false);
    expect((await purchase(employee.client, { lines: [line('black', 'Black')] })).status).toBe(403);
    expect(
      (await purchase(employee.client, { lines: [line('black', 'Black', 1, { totalCost: null })] }))
        .status,
    ).toBe(403);

    const unpriced = await purchase(admin.client, {
      lines: [line('black', 'Black'), line('white', 'White', 1, { totalCost: null })],
    });
    expect(unpriced.status).toBe(400);
    expect(unpriced.body.details).toEqual([
      { path: 'lines.1.totalCost', message: 'Enter the price paid for the roll' },
    ]);
  });
});

describe('per-roll low-stock warnings', () => {
  it('follows the company default, which changes every roll at once', async () => {
    const { client } = await registerWithCompany(app);
    const [item] = (await purchase(client, { lines: [line('black', 'Black', 2)] })).body;
    const lotId = item.lots[0].id;
    await client.post(
      '/api/v1/inventory/consumptions',
      { type: 'consumption', lines: [{ itemId: item.id, lotId, quantity: '850' }] },
      { 'Idempotency-Key': newKey() },
    );

    let view = (await client.get(`/api/v1/inventory/items/${item.id}`)).body;
    expect(view.lots[0]).toMatchObject({
      remaining: 150 * G,
      low: false,
      lowStockThreshold: null,
      effectiveLowStockThreshold: 100 * G,
    });

    await client.patch('/api/v1/companies/current/settings', {
      inventory: { rollLowStockThreshold: '200' },
    });
    view = (await client.get(`/api/v1/inventory/items/${item.id}`)).body;
    expect(view.lots[0]).toMatchObject({ low: true, effectiveLowStockThreshold: 200 * G });
    expect(view.lots[1].low).toBe(false); // the sealed roll is full
    expect(view).toMatchObject({ low: true, lowLots: 1 });
    expect((await client.get('/api/v1/inventory/summary')).body.lowStockItems).toBe(1);
  });

  it('lets one roll set its own limit, and go back to the default', async () => {
    const { client } = await registerWithCompany(app);
    const [item] = (
      await purchase(client, { lines: [line('black', 'Black', 1, { lowStockThreshold: '300' })] })
    ).body;
    const url = `/api/v1/inventory/items/${item.id}/lots/${item.lots[0].id}`;
    expect(item.lots[0]).toMatchObject({
      lowStockThreshold: 300 * G,
      effectiveLowStockThreshold: 300 * G,
    });

    const reset = await client.patch(url, { lowStockThreshold: null });
    expect(reset.body.lots[0]).toMatchObject({
      lowStockThreshold: null,
      effectiveLowStockThreshold: 100 * G,
    });
  });

  it('keeps consumables on the item total', async () => {
    const { client } = await registerWithCompany(app);
    const created = await client.post(
      '/api/v1/inventory/items',
      {
        item: {
          kind: 'material',
          name: 'M3 screw',
          category: 'Fasteners',
          unit: 'unit',
          lowStockThreshold: '10',
        },
        firstLot: { originalQuantity: '8', remaining: '8' },
      },
      { 'Idempotency-Key': newKey() },
    );
    expect(created.body).toMatchObject({ low: true, lowLots: 0 });
    expect(created.body.lots[0]).toMatchObject({ low: false, effectiveLowStockThreshold: null });
    const res = await client.patch(
      `/api/v1/inventory/items/${created.body.id}/lots/${created.body.lots[0].id}`,
      { lowStockThreshold: '5' },
    );
    expect(res.status).toBe(400);
  });
});
