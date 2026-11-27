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
const TODAY = new Date().toISOString().slice(0, 10);
const CAD = (amount: string) => ({ amount, currency: 'CAD' });

function sale(extra: Record<string, unknown> = {}) {
  return {
    saleDate: TODAY,
    customer: { kind: 'unknown' },
    currency: 'CAD',
    lines: [{ description: 'Keychain', quantity: '10', unitPrice: '10', estimatedCost: '30' }],
    ...extra,
  };
}

async function create(client: TestClient, extra: Record<string, unknown> = {}) {
  const res = await client.post('/api/v1/sales', sale(extra));
  if (res.status !== 201) throw new Error(`create failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function spool(client: TestClient, currency = 'CAD') {
  const res = await client.post(
    '/api/v1/inventory/items',
    {
      item: {
        kind: 'filament',
        name: 'PLA Black',
        filament: { materialType: 'PLA', colorKey: 'black', colorName: 'Black' },
      },
      firstLot: {
        originalQuantity: '1000',
        remaining: '1000',
        totalCost: { amount: '25', currency },
      },
    },
    { 'Idempotency-Key': newKey() },
  );
  expect(res.status).toBe(201);
  return { itemId: res.body.id as string, lotId: res.body.lots[0].id as string };
}

const use = (
  client: TestClient,
  path: string,
  roll: { itemId: string; lotId: string },
  grams: string,
) =>
  client.post(
    path,
    { type: 'consumption', lines: [{ itemId: roll.itemId, lotId: roll.lotId, quantity: grams }] },
    { 'Idempotency-Key': newKey() },
  );

async function saleOrder(client: TestClient, extra: Record<string, unknown> = {}) {
  const res = await client.post('/api/v1/orders', {
    title: 'Phone stands',
    type: 'sale',
    quantity: 5,
    recipient: { kind: 'name', name: 'Carla' },
    orderDate: TODAY,
    agreedPrice: CAD('50'),
    estimatedCost: CAD('12'),
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

describe('registering sales', () => {
  it('numbers sales, adds them up and tracks partial receipts', async () => {
    const { client } = await registerWithCompany(app);
    const first = await create(client, {
      discount: '5',
      delivery: '8',
      costs: [{ label: 'Shipping we paid', amount: '6' }],
      receipts: [{ amount: '40', receivedAt: TODAY, method: 'transfer' }],
    });
    expect(first).toMatchObject({
      code: 'VEN-0001',
      subtotal: 100 * M,
      total: 103 * M,
      received: 40 * M,
      outstanding: 63 * M,
      payment: 'partial',
      production: 'to_start',
      customer: { kind: 'unknown', name: '' },
    });
    // No stock recorded yet: the profit uses the estimate and says so.
    expect(first.profit).toMatchObject({
      basis: 'estimated',
      materials: 30 * M,
      extras: 6 * M,
      profit: 67 * M,
    });
    expect((await create(client)).code).toBe('VEN-0002');

    const paid = await client.post(`/api/v1/sales/${first.id}/receipts`, {
      amount: '63',
      receivedAt: TODAY,
      method: 'cash',
    });
    expect(paid.body).toMatchObject({ payment: 'paid', outstanding: 0 });
    expect(paid.body.receipts).toHaveLength(2);

    const removed = await client.delete(
      `/api/v1/sales/${first.id}/receipts/${paid.body.receipts[1].id}`,
    );
    expect(removed.body.payment).toBe('partial');
  });

  it('keeps the line labels as they were and summarizes per currency', async () => {
    const { client } = await registerWithCompany(app);
    const label = (await client.post('/api/v1/labels', { name: 'Keychain' })).body;
    const product = (
      await client.post('/api/v1/products', {
        type: 'product',
        name: 'Name keychain',
        labelIds: [label.id],
      })
    ).body;
    const made = await create(client, {
      lines: [
        { productId: product.id, description: 'Name keychain', quantity: '3', unitPrice: '10' },
      ],
    });
    expect(made.lines[0].labels).toEqual([{ id: label.id, name: 'Keychain' }]);
    await create(client, {
      currency: 'BRL',
      lines: [{ description: 'Vaso', quantity: '1', unitPrice: '80' }],
    });

    const list = (await client.get('/api/v1/sales')).body;
    expect(list.summary.count).toBe(2);
    expect(list.summary.sold).toEqual(
      expect.arrayContaining([
        { currency: 'CAD', amount: 30 * M },
        { currency: 'BRL', amount: 80 * M },
      ]),
    );
    expect((await client.get(`/api/v1/sales?productId=${product.id}`)).body.sales).toHaveLength(1);
    expect((await client.get('/api/v1/sales?q=VEN-0002')).body.sales[0].code).toBe('VEN-0002');
  });

  it('needs financial access, and stays inside its business', async () => {
    const admin = await registerWithCompany(app);
    const plain = await addEmployee(app, admin.client, false);
    const finance = await addEmployee(app, admin.client, true);
    const other = await registerWithCompany(app);
    const made = await create(admin.client);

    expect((await plain.client.get('/api/v1/sales')).status).toBe(403);
    expect((await finance.client.get(`/api/v1/sales/${made.id}`)).status).toBe(200);
    expect((await finance.client.post('/api/v1/sales', sale())).status).toBe(201);
    // Cancelling and deleting also need the archive permission.
    const cancel = await finance.client.post(`/api/v1/sales/${made.id}/cancel`, { reason: 'x' });
    expect(cancel.status).toBe(403);
    expect((await other.client.get(`/api/v1/sales/${made.id}`)).status).toBe(404);
  });
});

describe('sales from orders and quotes', () => {
  it('links one sale to an order: its payment and production follow', async () => {
    const { client } = await registerWithCompany(app);
    const order = await saleOrder(client);

    const draft = (await client.get(`/api/v1/sales/draft?orderId=${order.id}`)).body;
    expect(draft.draft).toMatchObject({
      orderId: order.id,
      customer: { kind: 'name', name: 'Carla' },
      lines: [
        { description: 'Phone stands', quantity: 5 * M, unitPrice: 10 * M, estimatedCost: 12 * M },
      ],
    });

    const made = await create(client, {
      customer: draft.draft.customer,
      orderId: draft.draft.orderId,
      lines: [{ description: 'Phone stands', quantity: '5', unitPrice: '10', estimatedCost: '12' }],
      receipts: [{ amount: '20', receivedAt: TODAY, method: 'cash' }],
    });
    expect(made.order).toEqual({ id: order.id, title: 'Phone stands' });

    const linked = (await client.get(`/api/v1/orders/${order.id}`)).body;
    expect(linked).toMatchObject({
      sale: { id: made.id, code: made.code },
      paymentStatus: 'partial',
    });
    // The order's own payment control gives way to the sale.
    const manual = await client.patch(`/api/v1/orders/${order.id}/payment`, {
      paymentStatus: 'paid',
    });
    expect(manual.status).toBe(409);
    expect((await client.post('/api/v1/sales', sale({ orderId: order.id }))).status).toBe(409);

    await client.post(`/api/v1/orders/${order.id}/move`, { status: 'in_progress' });
    expect((await client.get(`/api/v1/sales/${made.id}`)).body.production).toBe('in_production');

    await client.post(`/api/v1/sales/${made.id}/receipts`, {
      amount: '30',
      receivedAt: TODAY,
      method: 'cash',
    });
    expect((await client.get(`/api/v1/orders/${order.id}`)).body.paymentStatus).toBe('paid');

    // Stock recorded on the order becomes the sale's recorded cost.
    const roll = await spool(client);
    expect((await use(client, `/api/v1/orders/${order.id}/consumptions`, roll, '100')).status).toBe(
      201,
    );
    const costed = (await client.get(`/api/v1/sales/${made.id}`)).body;
    expect(costed.profit).toMatchObject({
      basis: 'recorded',
      materials: 2.5 * M,
      profit: 47.5 * M,
    });
    // Stock for a sale with an order goes on the order.
    expect((await use(client, `/api/v1/sales/${made.id}/consumptions`, roll, '10')).status).toBe(
      409,
    );
  });

  it('a gift has no sale', async () => {
    const { client } = await registerWithCompany(app);
    const gift = await saleOrder(client, { type: 'gift', agreedPrice: null });
    expect((await client.post('/api/v1/sales', sale({ orderId: gift.id }))).status).toBe(409);
  });

  it('prefills from an approved quote, once, with its taxes as lines', async () => {
    const { client } = await registerWithCompany(app);
    const quote = (
      await client.post('/api/v1/quotes', {
        language: 'en',
        currency: 'CAD',
        issuedAt: TODAY,
        customer: { name: 'Dana' },
        lines: [{ description: 'Bust', quantity: '1', unitPrice: '100' }],
        taxes: [{ label: 'GST', percent: '5' }],
      })
    ).body;
    expect((await client.post('/api/v1/sales', sale({ quoteId: quote.id }))).status).toBe(409);
    await client.post(`/api/v1/quotes/${quote.id}/actions`, { action: 'approve' });

    const draft = (await client.get(`/api/v1/sales/draft?quoteId=${quote.id}`)).body;
    expect(draft.draft.lines.map((l: { description: string }) => l.description)).toEqual([
      'Bust',
      'GST',
    ]);
    const made = await create(client, {
      quoteId: quote.id,
      customer: { kind: 'name', name: 'Dana' },
      lines: [
        { description: 'Bust', quantity: '1', unitPrice: '100' },
        { description: 'GST', quantity: '1', unitPrice: '5' },
      ],
    });
    expect(made).toMatchObject({ total: 105 * M, quote: { id: quote.id, code: quote.code } });
    expect((await client.get(`/api/v1/quotes/${quote.id}`)).body.saleId).toBe(made.id);
    expect((await client.post('/api/v1/sales', sale({ quoteId: quote.id }))).status).toBe(409);
    expect((await client.delete(`/api/v1/quotes/${quote.id}`)).status).toBe(409);
  });
});

describe('cancelling, deleting and costs', () => {
  it('a cancelled sale keeps its receipts but leaves the totals and can no longer change', async () => {
    const { client } = await registerWithCompany(app);
    const made = await create(client, {
      receipts: [{ amount: '50', receivedAt: TODAY, method: 'cash' }],
    });
    const cancelled = await client.post(`/api/v1/sales/${made.id}/cancel`, {
      reason: 'Customer gave up',
    });
    expect(cancelled.body).toMatchObject({
      cancelled: true,
      production: 'cancelled',
      received: 50 * M,
      cancelReason: 'Customer gave up',
    });
    expect((await client.get('/api/v1/sales')).body.summary.count).toBe(0);
    expect((await client.put(`/api/v1/sales/${made.id}`, sale())).status).toBe(409);
  });

  it('deleting a sale made by mistake frees its order; one with stock use is cancelled instead', async () => {
    const { client } = await registerWithCompany(app);
    const order = await saleOrder(client);
    const made = await create(client, { orderId: order.id });
    expect((await client.delete(`/api/v1/orders/${order.id}`)).status).toBe(409);
    expect((await client.delete(`/api/v1/sales/${made.id}`)).status).toBe(204);
    const freed = (await client.get(`/api/v1/orders/${order.id}`)).body;
    expect(freed.sale).toBeNull();
    expect(
      (await client.patch(`/api/v1/orders/${order.id}/payment`, { paymentStatus: 'paid' })).status,
    ).toBe(200);

    const direct = await create(client);
    const roll = await spool(client);
    expect((await use(client, `/api/v1/sales/${direct.id}/consumptions`, roll, '40')).status).toBe(
      201,
    );
    expect((await client.get(`/api/v1/sales/${direct.id}`)).body.profit).toMatchObject({
      basis: 'recorded',
      materials: 1 * M,
    });
    expect((await client.delete(`/api/v1/sales/${direct.id}`)).status).toBe(409);
  });

  it('converts a CAD roll used for a BRL sale with the rate saved on the sale', async () => {
    const { client } = await registerWithCompany(app);
    await client.patch('/api/v1/companies/current/settings', {
      currency: { defaultCurrency: 'CAD', brlPerCad: '4' },
    });
    const made = await create(client, {
      currency: 'BRL',
      lines: [{ description: 'Vaso', quantity: '1', unitPrice: '100' }],
    });
    expect(made.brlPerCad).toBe(4 * M);
    // A later rate change never rewrites this sale.
    await client.patch('/api/v1/companies/current/settings', {
      currency: { defaultCurrency: 'CAD', brlPerCad: '5' },
    });
    const roll = await spool(client, 'CAD');
    await use(client, `/api/v1/sales/${made.id}/consumptions`, roll, '120');
    const costed = (await client.get(`/api/v1/sales/${made.id}`)).body;
    expect(costed.profit).toMatchObject({ materials: 12 * M, profit: 88 * M, unconverted: [] });
  });

  it('customers and products in sales are archived, not deleted', async () => {
    const { client } = await registerWithCompany(app);
    const customer = (await client.post('/api/v1/customers', { name: 'Eva' })).body;
    const product = (await client.post('/api/v1/products', { type: 'product', name: 'Lamp' })).body;
    await create(client, {
      customer: { kind: 'customer', customerId: customer.id },
      lines: [{ productId: product.id, description: 'Lamp', quantity: '1', unitPrice: '40' }],
    });
    expect((await client.get(`/api/v1/customers/${customer.id}`)).body).toMatchObject({
      salesCount: 1,
      totalPurchased: [{ currency: 'CAD', amount: 40 * M }],
    });
    expect((await client.get(`/api/v1/products/${product.id}`)).body.soldQuantity).toBe(1);
    expect((await client.delete(`/api/v1/customers/${customer.id}`)).status).toBe(409);
    expect((await client.delete(`/api/v1/products/${product.id}`)).status).toBe(409);
  });
});
