import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { AuditLogModel } from '../src/core/audit/audit-log.model';
import { CustomerModel } from '../src/modules/customers/customer.model';
import { ExpenseModel } from '../src/modules/expenses/expense.model';
import { InventoryItemModel, StockMovementModel } from '../src/modules/inventory/inventory.model';
import { ProductModel } from '../src/modules/products/product.model';
import { addEmployee, newKey, registerWithCompany, type TestClient } from './client';
import { connectTestDatabase } from './memory-db';

const app = createApp();
let teardown: () => Promise<void>;

beforeAll(async () => {
  teardown = await connectTestDatabase();
});
afterAll(async () => teardown());

const CAD = (amount: string) => ({ amount, currency: 'CAD' });

const pla = (colorKey: string, colorName: string) => ({
  kind: 'filament',
  name: `PLA ${colorName}`,
  filament: { materialType: 'PLA', brand: 'Bambu Lab', colorKey, colorName },
});
const line = (colorKey: string, colorName: string, rolls = 1) => ({
  item: pla(colorKey, colorName),
  rolls,
  originalQuantity: '1000',
  totalCost: CAD('20'),
});

async function category(client: TestClient, name = 'Filament') {
  const all = (await client.get('/api/v1/companies/current/expense-categories')).body as {
    id: string;
    name: string;
  }[];
  return all.find((c) => c.name === name)?.id ?? '';
}

/** Buys filament with an expense, like the purchase screen does. */
async function buy(client: TestClient, lines: object[]) {
  const res = await client.post(
    '/api/v1/inventory/purchases',
    {
      store: 'Amazon',
      lines,
      expense: { categoryId: await category(client), paidAt: '2026-11-15', method: 'credit' },
    },
    { 'Idempotency-Key': newKey() },
  );
  if (res.status !== 201) throw new Error(`purchase failed: ${JSON.stringify(res.body)}`);
  return res.body as { id: string; name: string; lots: { id: string }[] }[];
}

const consume = (client: TestClient, itemId: string, lotId: string, quantity = '50') =>
  client.post(
    '/api/v1/inventory/consumptions',
    { type: 'consumption', lines: [{ itemId, lotId, quantity }] },
    { 'Idempotency-Key': newKey() },
  );

describe('deleting stock', () => {
  it('previews and deletes an item with its rolls, movements and its own expense', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const [item] = await buy(client, [line('black', 'Black', 2)]);
    if (!item) throw new Error('no item');
    await consume(client, item.id, item.lots[0]?.id ?? '');

    const preview = await client.get(`/api/v1/inventory/items/${item.id}/delete-preview`);
    expect(preview.body).toMatchObject({ lots: 2, movements: 3, linkedExpenseCount: 1 });
    expect(preview.body.expenses[0]).toMatchObject({ shared: false, amount: { currency: 'CAD' } });

    const res = await client.delete(`/api/v1/inventory/items/${item.id}?expenses=delete`);
    expect(res.status).toBe(204);
    expect(await InventoryItemModel.countDocuments({ companyId })).toBe(0);
    expect(await StockMovementModel.countDocuments({ companyId })).toBe(0);
    expect(await ExpenseModel.countDocuments({ companyId })).toBe(0);
    expect(
      await AuditLogModel.exists({ companyId, action: 'inventory.item_deleted' }),
    ).toBeTruthy();
  });

  it('keeps the expense when asked, and keeps an expense shared with other items', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const [black, white] = await buy(client, [line('black', 'Black'), line('white', 'White')]);
    if (!black || !white) throw new Error('no items');

    const preview = await client.get(`/api/v1/inventory/items/${black.id}/delete-preview`);
    expect(preview.body.expenses[0].shared).toBe(true);

    // Even with expenses=delete, the shared expense stays: it still pays for the white roll.
    await client.delete(`/api/v1/inventory/items/${black.id}?expenses=delete`);
    const [expense] = await ExpenseModel.find({ companyId }).lean();
    expect(expense?.stock.map((s) => s.lotId.toString())).toEqual([white.lots[0]?.id]);

    await client.delete(`/api/v1/inventory/items/${white.id}`);
    const kept = await ExpenseModel.find({ companyId }).lean();
    expect(kept).toHaveLength(1);
    expect(kept[0]?.stock).toEqual([]);
  });

  it('deletes one roll and leaves the others', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const [item] = await buy(client, [line('black', 'Black', 3)]);
    const [, second] = item?.lots ?? [];
    const res = await client.delete(
      `/api/v1/inventory/items/${item?.id}/lots/${second?.id}?expenses=delete`,
    );
    expect(res.status).toBe(200);
    expect(res.body.lots.map((l: { label: string }) => l.label)).toEqual(['Roll 1', 'Roll 3']);
    // The expense also paid for rolls 1 and 3, so it stays and only loses roll 2.
    const [expense] = await ExpenseModel.find({ companyId }).lean();
    expect(expense?.stock).toHaveLength(2);
  });

  it('only lets an admin delete stock, and hides another business stock', async () => {
    const { client } = await registerWithCompany(app);
    const employee = await addEmployee(app, client, true);
    const [item] = await buy(client, [line('black', 'Black')]);
    expect((await employee.client.delete(`/api/v1/inventory/items/${item?.id}`)).status).toBe(403);
    const other = await registerWithCompany(app, 'Other');
    expect((await other.client.delete(`/api/v1/inventory/items/${item?.id}`)).status).toBe(404);
  });

  it('refuses stock used by an order or a sale', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const [item] = await buy(client, [line('black', 'Black')]);
    await consume(client, item?.id ?? '', item?.lots[0]?.id ?? '');
    // Orders arrive in Part 7; simulate a movement that belongs to one.
    await StockMovementModel.updateOne({ companyId }, { $set: { orderId: item?.id } });
    const res = await client.delete(`/api/v1/inventory/items/${item?.id}`);
    expect(res.status).toBe(409);
    expect(await InventoryItemModel.countDocuments({ companyId })).toBe(1);
  });
});

describe('deleting expenses', () => {
  it('deletes an expense with its payments and unlinks the rolls it paid for', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const [item] = await buy(client, [line('black', 'Black')]);
    const [expense] = await ExpenseModel.find({ companyId }).lean();
    const res = await client.delete(`/api/v1/expenses/${expense?._id.toString()}`);
    expect(res.status).toBe(204);
    expect(await ExpenseModel.countDocuments({ companyId })).toBe(0);
    const stored = await InventoryItemModel.findOne({ companyId }).lean();
    expect(stored?.lots[0]?.expenseId).toBeNull();
    // The roll is back on the "not recorded in expenses" list.
    const unrecorded = await client.get('/api/v1/inventory/unrecorded-lots');
    expect(unrecorded.body.map((l: { itemId: string }) => l.itemId)).toEqual([item?.id]);
  });

  it('needs financial management and the archive right', async () => {
    const { client } = await registerWithCompany(app);
    const employee = await addEmployee(app, client, true);
    const created = await client.post('/api/v1/expenses', {
      description: 'Glue sticks',
      categoryId: await category(client, 'Materials'),
      amount: CAD('12'),
      purchasedAt: '2026-11-10',
    });
    expect(created.status).toBe(201);
    expect((await employee.client.delete(`/api/v1/expenses/${created.body.id}`)).status).toBe(403);
    expect((await client.delete(`/api/v1/expenses/${created.body.id}`)).status).toBe(204);
  });
});

describe('deleting catalog and customers', () => {
  it('deletes a product, a customer, a label and a source, cleaning their links', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const label = (await client.post('/api/v1/labels', { name: 'Keychain' })).body;
    const product = (
      await client.post('/api/v1/products', { type: 'product', name: 'Cat', labelIds: [label.id] })
    ).body;
    const sources = (await client.get('/api/v1/customer-sources')).body as { id: string }[];
    const source = sources[0];
    const customer = (await client.post('/api/v1/customers', { name: 'Ana', sourceId: source?.id }))
      .body;

    expect((await client.delete(`/api/v1/labels/${label.id}`)).status).toBe(204);
    expect((await ProductModel.findOne({ companyId }).lean())?.labelIds).toEqual([]);

    expect((await client.delete(`/api/v1/customer-sources/${source?.id}`)).status).toBe(204);
    expect((await CustomerModel.findOne({ companyId }).lean())?.sourceId).toBeNull();

    expect((await client.delete(`/api/v1/products/${product.id}`)).status).toBe(204);
    expect((await client.delete(`/api/v1/customers/${customer.id}`)).status).toBe(204);
    expect(await ProductModel.countDocuments({ companyId })).toBe(0);
    expect(await CustomerModel.countDocuments({ companyId })).toBe(0);
  });

  it('lets only an admin delete products and customers', async () => {
    const { client } = await registerWithCompany(app);
    const employee = await addEmployee(app, client, true);
    const product = (await client.post('/api/v1/products', { type: 'product', name: 'Cat' })).body;
    expect((await employee.client.delete(`/api/v1/products/${product.id}`)).status).toBe(403);
  });
});

describe('deleting settings records', () => {
  it('deletes an unused category and refuses one that expenses use', async () => {
    const { client } = await registerWithCompany(app);
    const fresh = await client.post('/api/v1/companies/current/expense-categories', {
      name: 'Shipping boxes',
    });
    expect(
      (await client.delete(`/api/v1/companies/current/expense-categories/${fresh.body.id}`)).status,
    ).toBe(204);

    const supplies = await category(client, 'Materials');
    await client.post('/api/v1/expenses', {
      description: 'Glue',
      categoryId: supplies,
      amount: CAD('5'),
      purchasedAt: '2026-11-10',
    });
    const used = await client.delete(`/api/v1/companies/current/expense-categories/${supplies}`);
    expect(used.status).toBe(409);
    expect(used.body.message).toContain('Archive it instead');
  });
});
