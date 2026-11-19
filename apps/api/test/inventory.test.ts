import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { ExpenseModel } from '../src/modules/expenses/expense.model';
import { InventoryItemModel, StockMovementModel } from '../src/modules/inventory/inventory.model';
import { addEmployee, newKey, registerWithCompany, type TestClient } from './client';
import { connectTestDatabase } from './memory-db';

const app = createApp();
let teardown: () => Promise<void>;

beforeAll(async () => {
  teardown = await connectTestDatabase();
});
afterAll(async () => teardown());

const G = 1_000_000; // one gram (or one unit) in micro-units
const CAD = (amount: string) => ({ amount, currency: 'CAD' });

const plaBlack = {
  kind: 'filament',
  name: 'PLA Black',
  lowStockThreshold: '100',
  filament: { materialType: 'PLA', brand: 'Flashforge', colorKey: 'black', colorName: 'Black' },
};

async function createSpool(
  client: TestClient,
  lot: object = { originalQuantity: '1000', remaining: '1000', totalCost: CAD('25') },
) {
  const res = await client.post(
    '/api/v1/inventory/items',
    // Filament rolls always need a price; tests that only care about grams get a default one.
    { item: plaBlack, firstLot: { totalCost: CAD('25'), ...lot } },
    { 'Idempotency-Key': newKey() },
  );
  expect(res.status).toBe(201);
  return res.body as { id: string; lots: { id: string }[] } & Record<string, unknown>;
}

const consume = (client: TestClient, lines: object[], key = newKey(), type = 'consumption') =>
  client.post('/api/v1/inventory/consumptions', { type, lines }, { 'Idempotency-Key': key });

describe('adding stock', () => {
  it('creates a spool whose cost per gram comes from its own price', async () => {
    const { client } = await registerWithCompany(app);
    const item = await createSpool(client);
    expect(item).toMatchObject({
      kind: 'filament',
      unit: 'g',
      remaining: 1000 * G,
      low: false,
      out: false,
    });
    expect(item.lots).toEqual([
      expect.objectContaining({
        label: 'Roll 1',
        status: 'sealed',
        remaining: 1000 * G,
        unitCost: { amount: 25_000, currency: 'CAD' },
      }),
    ]);
    expect(item.value).toEqual([{ amount: 25 * G, currency: 'CAD' }]);

    const movements = (await client.get(`/api/v1/inventory/items/${item.id}/movements`)).body;
    expect(movements).toEqual([
      expect.objectContaining({
        type: 'purchase',
        delta: 1000 * G,
        balanceBefore: 0,
        balanceAfter: 1000 * G,
      }),
    ]);
  });

  it('registers a partly used roll with its current grams', async () => {
    const { client } = await registerWithCompany(app);
    const item = await createSpool(client, {
      originalQuantity: '1000',
      remaining: '750',
      totalCost: CAD('25'),
    });
    expect(item.lots).toEqual([expect.objectContaining({ status: 'in_use', remaining: 750 * G })]);
  });

  it('adds a second roll of the same filament with a different price', async () => {
    const { client } = await registerWithCompany(app);
    const item = await createSpool(client);
    const res = await client.post(
      `/api/v1/inventory/items/${item.id}/lots`,
      { originalQuantity: '1000', remaining: '1000', totalCost: CAD('22') },
      { 'Idempotency-Key': newKey() },
    );
    expect(res.status).toBe(201);
    expect(res.body.lots.map((l: { label: string }) => l.label)).toEqual(['Roll 1', 'Roll 2']);
    expect(res.body.lots[1].unitCost.amount).toBe(22_000);
    expect(res.body.value).toEqual([{ amount: 47 * G, currency: 'CAD' }]);
  });

  it('a repeated request with the same key creates nothing new', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const key = newKey();
    const body = {
      item: plaBlack,
      firstLot: { originalQuantity: '1000', remaining: '1000', totalCost: CAD('25') },
    };
    const first = await client.post('/api/v1/inventory/items', body, { 'Idempotency-Key': key });
    const again = await client.post('/api/v1/inventory/items', body, { 'Idempotency-Key': key });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body.id).toBe(first.body.id);
    expect(await InventoryItemModel.countDocuments({ companyId })).toBe(1);
  });

  it('requires an idempotency key when stock moves', async () => {
    const { client } = await registerWithCompany(app);
    const res = await client.post('/api/v1/inventory/items', {
      item: plaBlack,
      firstLot: { originalQuantity: '10', remaining: '10', totalCost: CAD('1') },
    });
    expect(res.status).toBe(400);
  });

  it('creates consumables in their own units', async () => {
    const { client } = await registerWithCompany(app);
    const res = await client.post(
      '/api/v1/inventory/items',
      {
        item: { kind: 'material', name: 'M3 screw', category: 'Fasteners', unit: 'unit' },
        firstLot: { originalQuantity: '100', remaining: '100', totalCost: CAD('10') },
      },
      { 'Idempotency-Key': newKey() },
    );
    expect(res.body).toMatchObject({ unit: 'unit', remaining: 100 * G });
    expect(res.body.lots[0]).toMatchObject({
      label: 'Lot 1',
      unitCost: { amount: 100_000, currency: 'CAD' },
    }); // 0.10 each
  });
});

describe('filament price rule', () => {
  it('refuses a filament roll without its price', async () => {
    const { client } = await registerWithCompany(app);
    const res = await client.post(
      '/api/v1/inventory/items',
      { item: plaBlack, firstLot: { originalQuantity: '1000', remaining: '1000' } },
      { 'Idempotency-Key': newKey() },
    );
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([
      { path: 'firstLot.totalCost', message: 'Enter the price paid for the roll' },
    ]);
  });

  it('refuses adding a roll without its price', async () => {
    const { client } = await registerWithCompany(app);
    const item = await createSpool(client);
    const res = await client.post(
      `/api/v1/inventory/items/${item.id}/lots`,
      { originalQuantity: '1000', remaining: '1000' },
      { 'Idempotency-Key': newKey() },
    );
    expect(res.status).toBe(400);
  });

  it('still allows consumables without a price', async () => {
    const { client } = await registerWithCompany(app);
    const res = await client.post(
      '/api/v1/inventory/items',
      {
        item: { kind: 'packaging', name: 'Small box', category: 'Packaging', unit: 'unit' },
        firstLot: { originalQuantity: '20', remaining: '20' },
      },
      { 'Idempotency-Key': newKey() },
    );
    expect(res.status).toBe(201);
  });
});

describe('linked purchase expense', () => {
  it('records one expense for the roll, paid, and never duplicates it on replay', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const categories = (await client.get('/api/v1/companies/current/expense-categories')).body;
    const filament = categories.find((c: { name: string }) => c.name === 'Filament');
    const key = newKey();
    const body = {
      item: plaBlack,
      firstLot: {
        originalQuantity: '1000',
        remaining: '1000',
        totalCost: CAD('25'),
        store: 'Amazon',
        expense: { categoryId: filament.id, paidAt: '2026-11-10', method: 'credit' },
      },
    };
    const first = await client.post('/api/v1/inventory/items', body, { 'Idempotency-Key': key });
    await client.post('/api/v1/inventory/items', body, { 'Idempotency-Key': key });

    expect(await ExpenseModel.countDocuments({ companyId })).toBe(1);
    const expense = await ExpenseModel.findOne({ companyId }).lean();
    expect(expense).toMatchObject({
      status: 'paid',
      paid: 25 * G,
      vendor: 'Amazon',
      description: 'PLA Black · Roll 1',
    });
    expect(expense?.stock.map((s) => s.lotId.toString())).toEqual([first.body.lots[0].id]);
    expect(first.body.lots[0].expenseId).toBe(expense?._id.toString());
  });

  it('allows stock bought before the app without inventing an expense', async () => {
    const { client, companyId } = await registerWithCompany(app);
    await createSpool(client);
    expect(await ExpenseModel.countDocuments({ companyId })).toBe(0);
  });
});

describe('consumption', () => {
  it('deducts actual grams, keeps the cost snapshot and opens the roll', async () => {
    const { client } = await registerWithCompany(app);
    const item = await createSpool(client);
    const lotId = item.lots[0]?.id;
    const res = await consume(client, [{ itemId: item.id, lotId, quantity: '120' }]);
    expect(res.status).toBe(201);
    expect(res.body).toEqual([
      expect.objectContaining({
        type: 'consumption',
        delta: -120 * G,
        balanceBefore: 1000 * G,
        balanceAfter: 880 * G,
        unitCost: { amount: 25_000, currency: 'CAD' },
      }),
    ]);
    const after = (await client.get(`/api/v1/inventory/items/${item.id}`)).body;
    expect(after.lots[0]).toMatchObject({ remaining: 880 * G, status: 'in_use', used: true });
  });

  it('is all or nothing across lines and says how much is available', async () => {
    const { client } = await registerWithCompany(app);
    const item = await createSpool(client, { originalQuantity: '1000', remaining: '80' });
    const other = await createSpool(client);
    const res = await consume(client, [
      { itemId: other.id, lotId: other.lots[0]?.id, quantity: '100' },
      { itemId: item.id, lotId: item.lots[0]?.id, quantity: '150' },
    ]);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'INSUFFICIENT_STOCK', details: { available: 80 * G } });
    // The first line was rolled back too.
    expect((await client.get(`/api/v1/inventory/items/${other.id}`)).body.remaining).toBe(1000 * G);
  });

  it('a double click deducts once', async () => {
    const { client } = await registerWithCompany(app);
    const item = await createSpool(client);
    const key = newKey();
    const line = [{ itemId: item.id, lotId: item.lots[0]?.id, quantity: '100' }];
    await Promise.all([consume(client, line, key), consume(client, line, key)]);
    await consume(client, line, key);
    expect((await client.get(`/api/v1/inventory/items/${item.id}`)).body.remaining).toBe(900 * G);
  });

  it('concurrent requests can never take more than the lot holds', async () => {
    const { client } = await registerWithCompany(app);
    const item = await createSpool(client);
    const line = [{ itemId: item.id, lotId: item.lots[0]?.id, quantity: '600' }];
    const results = await Promise.all([consume(client, line), consume(client, line)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await client.get(`/api/v1/inventory/items/${item.id}`)).body.remaining).toBe(400 * G);
  });

  it('records a failed print as a loss and empties the roll at zero', async () => {
    const { client } = await registerWithCompany(app);
    const item = await createSpool(client, { originalQuantity: '1000', remaining: '45' });
    const res = await consume(
      client,
      [{ itemId: item.id, lotId: item.lots[0]?.id, quantity: '45' }],
      newKey(),
      'loss',
    );
    expect(res.body[0]).toMatchObject({ type: 'loss', reason: 'Failed print or waste' });
    const after = (await client.get(`/api/v1/inventory/items/${item.id}`)).body;
    expect(after).toMatchObject({ out: true });
    expect(after.lots[0].status).toBe('empty');
  });

  it('flags low stock at the threshold', async () => {
    const { client } = await registerWithCompany(app);
    const item = await createSpool(client);
    await consume(client, [{ itemId: item.id, lotId: item.lots[0]?.id, quantity: '915' }]);
    const after = (await client.get(`/api/v1/inventory/items/${item.id}`)).body;
    expect(after).toMatchObject({ low: true, remaining: 85 * G });
    const summary = (await client.get('/api/v1/inventory/summary')).body;
    expect(summary).toMatchObject({ filamentItems: 1, filamentGrams: 85 * G, lowStockItems: 1 });
    expect((await client.get('/api/v1/inventory/items?stock=low')).body).toHaveLength(1);
  });
});

describe('corrections', () => {
  it('adjusts to a weighed quantity, recording the difference', async () => {
    const { client } = await registerWithCompany(app);
    const item = await createSpool(client, { originalQuantity: '1000', remaining: '750' });
    const res = await client.post(
      `/api/v1/inventory/items/${item.id}/lots/${item.lots[0]?.id}/adjust`,
      { countedQuantity: '720', reason: 'weighed spool' },
      { 'Idempotency-Key': newKey() },
    );
    expect(res.body.lots[0].remaining).toBe(720 * G);
    const [latest] = (await client.get(`/api/v1/inventory/items/${item.id}/movements`)).body;
    expect(latest).toMatchObject({ type: 'adjustment', delta: -30 * G, reason: 'weighed spool' });
  });

  it('reverses a wrong entry once, without rewriting history', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const item = await createSpool(client);
    const [wrong] = (
      await consume(client, [{ itemId: item.id, lotId: item.lots[0]?.id, quantity: '200' }])
    ).body;

    const reverse = (movementId: string) =>
      client.post(
        `/api/v1/inventory/movements/${movementId}/reverse`,
        { reason: 'Entered 200 g, used 120 g' },
        { 'Idempotency-Key': newKey() },
      );

    const reversed = await reverse(wrong.id);
    expect(reversed.body.remaining).toBe(1000 * G);
    expect((await reverse(wrong.id)).body.code).toBe('ALREADY_REVERSED');

    const movements = (await client.get(`/api/v1/inventory/items/${item.id}/movements`)).body;
    const correction = movements.find((m: { type: string }) => m.type === 'correction');
    expect(correction).toMatchObject({ delta: 200 * G, reversalOf: wrong.id });
    expect(movements.find((m: { id: string }) => m.id === wrong.id).reversed).toBe(true);
    expect((await reverse(correction.id)).body.code).toBe('IS_CORRECTION');
    // Nothing was edited or deleted: purchase, consumption and correction are all there.
    expect(await StockMovementModel.countDocuments({ companyId, itemId: item.id })).toBe(3);
  });

  it('locks a lot cost once stock was taken from it', async () => {
    const { client } = await registerWithCompany(app);
    const item = await createSpool(client);
    const lotUrl = `/api/v1/inventory/items/${item.id}/lots/${item.lots[0]?.id}`;
    expect((await client.patch(lotUrl, { totalCost: CAD('24') })).status).toBe(200);
    await consume(client, [{ itemId: item.id, lotId: item.lots[0]?.id, quantity: '10' }]);
    const res = await client.patch(lotUrl, { totalCost: CAD('30') });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LOT_USED');
  });
});

describe('permissions and isolation', () => {
  it('employees without financial access enter prices when registering, but never see costs', async () => {
    const admin = await registerWithCompany(app);
    const item = await createSpool(admin.client);
    const employee = await addEmployee(app, admin.client, false);

    const seen = (await employee.client.get(`/api/v1/inventory/items/${item.id}`)).body;
    expect(seen.value).toBeNull();
    expect(seen.lots[0].unitCost).toBeNull();
    expect((await employee.client.get('/api/v1/inventory/summary')).body.value).toBeNull();

    const withCost = await employee.client.post(
      `/api/v1/inventory/items/${item.id}/lots`,
      { originalQuantity: '1000', remaining: '1000', totalCost: CAD('25') },
      { 'Idempotency-Key': newKey() },
    );
    expect(withCost.status).toBe(201);
    // The roll was priced, but the employee's view still hides it.
    expect(withCost.body.lots[1].unitCost).toBeNull();
    const asAdmin = (await admin.client.get(`/api/v1/inventory/items/${item.id}`)).body;
    expect(asAdmin.lots[1].unitCost).toEqual({ amount: 25_000, currency: 'CAD' });
    // Changing a recorded price stays with financial access.
    const lotUrl = `/api/v1/inventory/items/${item.id}/lots/${item.lots[0]?.id}`;
    expect((await employee.client.patch(lotUrl, { totalCost: CAD('30') })).status).toBe(403);
    expect(
      (
        await consume(employee.client, [
          { itemId: item.id, lotId: item.lots[0]?.id, quantity: '10' },
        ])
      ).status,
    ).toBe(201);
  });

  it('archiving needs the archive permission', async () => {
    const admin = await registerWithCompany(app);
    const item = await createSpool(admin.client);
    const employee = await addEmployee(app, admin.client, true);
    const url = `/api/v1/inventory/items/${item.id}/archive`;
    expect((await employee.client.post(url, { archived: true })).status).toBe(403);
    expect((await admin.client.post(url, { archived: true })).body.archived).toBe(true);
  });

  it('another company cannot read or consume this stock', async () => {
    const a = await registerWithCompany(app, 'Company A');
    const b = await registerWithCompany(app, 'Company B');
    const item = await createSpool(a.client);
    expect((await b.client.get(`/api/v1/inventory/items/${item.id}`)).status).toBe(404);
    const res = await consume(b.client, [
      { itemId: item.id, lotId: item.lots[0]?.id, quantity: '10' },
    ]);
    expect(res.status).toBe(404);
    expect((await a.client.get(`/api/v1/inventory/items/${item.id}`)).body.remaining).toBe(
      1000 * G,
    );
  });
});
