import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { InventoryItemModel, StockMovementModel } from '../src/modules/inventory/inventory.model';
import { OrderPictureModel } from '../src/modules/orders/order-picture.model';
import { OrderModel } from '../src/modules/orders/order.model';
import { addEmployee, newKey, registerWithCompany, type TestClient } from './client';
import { connectTestDatabase } from './memory-db';

const app = createApp();
let teardown: () => Promise<void>;

beforeAll(async () => {
  teardown = await connectTestDatabase();
});
afterAll(async () => teardown());

const M = 1_000_000;
const DAY = 86_400_000;
const CAD = (amount: string) => ({ amount, currency: 'CAD' });
const TODAY = new Date().toISOString().slice(0, 10);
const shift = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

interface Card {
  id: string;
  title: string;
  status: string;
  rank: string;
  overdue: boolean;
  hidden: boolean;
  stale: { days: number; threshold: number } | null;
  paymentStatus: string;
  [key: string]: unknown;
}

function order(extra: Record<string, unknown> = {}) {
  return {
    title: 'Keychain for João',
    type: 'sale',
    quantity: 10,
    recipient: { kind: 'name', name: 'João' },
    orderDate: TODAY,
    ...extra,
  };
}

async function create(client: TestClient, extra: Record<string, unknown> = {}) {
  const res = await client.post('/api/v1/orders', order(extra));
  if (res.status !== 201) throw new Error(`create failed: ${JSON.stringify(res.body)}`);
  return res.body as Card & Record<string, unknown>;
}

const move = (client: TestClient, id: string, body: Record<string, unknown>) =>
  client.post(`/api/v1/orders/${id}/move`, body);

async function board(client: TestClient, query = '') {
  const res = await client.get(`/api/v1/orders${query ? `?${query}` : ''}`);
  expect(res.status).toBe(200);
  return res.body as { orders: Card[]; counts: Record<string, number>; retentionDays: number };
}

const column = async (client: TestClient, status: string) =>
  (await board(client)).orders.filter((o) => o.status === status).map((o) => o.title);

async function spool(client: TestClient, grams = '1000', price = '25') {
  const res = await client.post(
    '/api/v1/inventory/items',
    {
      item: {
        kind: 'filament',
        name: 'PLA Black',
        filament: { materialType: 'PLA', colorKey: 'black', colorName: 'Black' },
      },
      firstLot: { originalQuantity: grams, remaining: grams, totalCost: CAD(price) },
    },
    { 'Idempotency-Key': newKey() },
  );
  expect(res.status).toBe(201);
  return { itemId: res.body.id as string, lotId: res.body.lots[0].id as string };
}

async function screws(client: TestClient) {
  const res = await client.post(
    '/api/v1/inventory/items',
    {
      item: { kind: 'material', name: 'Allen screw', category: 'Fasteners', unit: 'unit' },
      firstLot: { originalQuantity: '100', remaining: '100', totalCost: CAD('40') },
    },
    { 'Idempotency-Key': newKey() },
  );
  expect(res.status).toBe(201);
  return { itemId: res.body.id as string, lotId: res.body.lots[0].id as string };
}

/** Test-only reads that look a record up by id alone. */
const ANY = { skipTenantScope: true };
const companyOf = async (orderId: string) =>
  (await OrderModel.findOne({ _id: orderId }, { companyId: 1 }, ANY).lean())!.companyId;

const remaining = async (itemId: string) =>
  (await InventoryItemModel.findOne({ _id: itemId }, null, ANY).lean())!.lots[0]!.remaining;

describe('orders', () => {
  it('creates sale, gift and personal jobs; only a sale has a price to pay', async () => {
    const { client } = await registerWithCompany(app);
    const sale = await create(client, { agreedPrice: CAD('100'), dueDate: shift(5) });
    expect(sale).toMatchObject({
      type: 'sale',
      status: 'todo',
      priority: 'normal',
      paymentStatus: 'unpaid',
      agreedPrice: { amount: 100 * M, currency: 'CAD' },
      recipient: { kind: 'name', name: 'João' },
      history: [expect.objectContaining({ status: 'todo', by: 'Test User' })],
    });

    const personal = await create(client, {
      type: 'personal',
      title: 'Drawer repair piece',
      quantity: 1,
      recipient: { kind: 'myself' },
      agreedPrice: CAD('50'),
      paymentStatus: 'paid',
    });
    expect(personal).toMatchObject({
      recipient: { kind: 'myself', name: 'Myself' },
      paymentStatus: 'not_required',
      agreedPrice: null,
      dueDate: null,
    });
  });

  it('checks every reference against the business', async () => {
    const { client } = await registerWithCompany(app);
    const other = await registerWithCompany(app, 'Other shop');
    const customer = (await other.client.post('/api/v1/customers', { name: 'Ana' })).body;
    const product = (
      await other.client.post('/api/v1/products', { type: 'product', name: 'Dragon', labelIds: [] })
    ).body;
    const printer = (await other.client.post('/api/v1/companies/current/printers', { name: 'P1S' }))
      .body;
    const bad = async (extra: Record<string, unknown>, path: string) => {
      const res = await client.post('/api/v1/orders', order(extra));
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.details)).toContain(path);
    };
    await bad({ recipient: { kind: 'customer', customerId: customer.id } }, 'recipient.customerId');
    await bad({ productId: product.id }, 'productId');
    await bad({ printerId: printer.id }, 'printerId');

    const mine = await create(client);
    for (const res of [
      await other.client.get(`/api/v1/orders/${mine.id}`),
      await other.client.put(`/api/v1/orders/${mine.id}`, order()),
      await move(other.client, mine.id, { status: 'in_progress' }),
      await other.client.post(`/api/v1/orders/${mine.id}/reminder`, { action: 'contacted' }),
      await other.client.get(`/api/v1/orders/${mine.id}/movements`),
    ]) {
      expect(res.status).toBe(404);
    }
    expect((await board(other.client)).orders).toEqual([]);
  });

  it('hides prices and costs without financial access, and keeps them when such a member edits', async () => {
    const admin = await registerWithCompany(app);
    const employee = await addEmployee(app, admin.client, false);
    const sale = await create(admin.client, {
      agreedPrice: CAD('80'),
      estimatedCost: CAD('30'),
    });
    const seen = (await employee.client.get(`/api/v1/orders/${sale.id}`)).body;
    expect(seen).toMatchObject({ agreedPrice: null, estimatedCost: null, costSummary: null });

    const edited = await employee.client.put(
      `/api/v1/orders/${sale.id}`,
      order({ title: 'Keychains (10)', agreedPrice: CAD('1'), paymentStatus: 'paid' }),
    );
    expect(edited.status).toBe(200);
    const after = (await admin.client.get(`/api/v1/orders/${sale.id}`)).body;
    expect(after).toMatchObject({
      title: 'Keychains (10)',
      agreedPrice: { amount: 80 * M },
      estimatedCost: { amount: 30 * M },
      paymentStatus: 'unpaid',
    });
    const pay = await employee.client.patch(`/api/v1/orders/${sale.id}/payment`, {
      paymentStatus: 'paid',
    });
    expect(pay.status).toBe(403);
  });
});

describe('the board', () => {
  it('moves cards between columns, records the history and restarts the column clock', async () => {
    const { client } = await registerWithCompany(app);
    const card = await create(client);
    const entered = card.statusEnteredAt;

    const started = await move(client, card.id, { status: 'in_progress', note: 'On the P1S' });
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('in_progress');
    expect(started.body.statusEnteredAt).not.toBe(entered);
    expect(started.body.history.map((h: { status: string }) => h.status)).toEqual([
      'todo',
      'in_progress',
    ]);
    expect(started.body.history[1].note).toBe('On the P1S');

    // Blocked is no longer a column: a flag says what the card waits for, and it stays put.
    expect((await move(client, card.id, { status: 'blocked' })).status).toBe(400);
    const hold = (blocked: unknown) => client.patch(`/api/v1/orders/${card.id}/hold`, { blocked });
    const held = await hold({ reason: 'material_missing', note: 'Out of white PETG' });
    expect(held.body).toMatchObject({
      status: 'in_progress',
      blocked: { reason: 'material_missing', note: 'Out of white PETG' },
    });
    expect((await hold(null)).body.blocked).toBeNull();

    // Finishing clears the flag, and a finished card can't be flagged again.
    await hold({ reason: 'printer_issue' });
    const done = await move(client, card.id, { status: 'completed' });
    expect(done.body.blocked).toBeNull();
    expect((await hold({ reason: 'other' })).status).toBe(409);
  });

  it('reads an order saved in an old column as its new column', async () => {
    const { client } = await registerWithCompany(app);
    const card = await create(client);
    const companyId = await companyOf(card.id);
    await OrderModel.collection.updateOne(
      { _id: new Types.ObjectId(card.id), companyId },
      { $set: { status: 'waiting' } },
    );
    const read = await client.get(`/api/v1/orders/${card.id}`);
    expect(read.body).toMatchObject({ status: 'todo', blocked: { reason: 'quote_approval' } });
    await OrderModel.collection.updateOne(
      { _id: new Types.ObjectId(card.id), companyId },
      { $set: { status: 'printed', blocked: null } },
    );
    expect((await board(client)).orders[0]).toMatchObject({ status: 'ready', blocked: null });
  });

  it('keeps a manual order inside each column', async () => {
    const { client } = await registerWithCompany(app);
    const a = await create(client, { title: 'A' });
    const b = await create(client, { title: 'B' });
    const c = await create(client, { title: 'C' });
    expect(await column(client, 'todo')).toEqual(['A', 'B', 'C']);

    await move(client, c.id, { status: 'todo', afterId: null });
    expect(await column(client, 'todo')).toEqual(['C', 'A', 'B']);
    await move(client, c.id, { status: 'todo', afterId: a.id });
    expect(await column(client, 'todo')).toEqual(['A', 'C', 'B']);
    await move(client, a.id, { status: 'todo', afterId: b.id });
    expect(await column(client, 'todo')).toEqual(['C', 'B', 'A']);

    // Into another column at a chosen spot.
    await move(client, b.id, { status: 'in_progress' });
    await move(client, a.id, { status: 'in_progress', afterId: null });
    expect(await column(client, 'in_progress')).toEqual(['A', 'B']);
    // Reordering inside a column is not a status change.
    const reordered = await move(client, b.id, { status: 'in_progress', afterId: null });
    expect(reordered.body.history).toHaveLength(2);
    expect(await column(client, 'in_progress')).toEqual(['B', 'A']);

    // A card from another column can't be the anchor.
    expect((await move(client, c.id, { status: 'todo', afterId: b.id })).status).toBe(400);
  });

  it('places a new card by its deadline unless a spot is chosen', async () => {
    const { client } = await registerWithCompany(app);
    await create(client, { title: 'No deadline' });
    await create(client, { title: 'In ten days', dueDate: shift(10) });
    await create(client, { title: 'In two days', dueDate: shift(2) });
    expect(await column(client, 'todo')).toEqual(['In two days', 'In ten days', 'No deadline']);
  });

  it('flags late cards by date and counts the columns', async () => {
    const { client } = await registerWithCompany(app);
    const late = await create(client, { title: 'Late', orderDate: shift(-10), dueDate: shift(-1) });
    await create(client, { title: 'Due today', dueDate: TODAY });
    const started = await create(client, { title: 'Started' });
    await move(client, started.id, { status: 'in_progress' });

    const view = await board(client);
    expect(view.orders.find((o) => o.title === 'Late')?.overdue).toBe(true);
    expect(view.orders.find((o) => o.title === 'Due today')?.overdue).toBe(false);
    expect(view.counts).toMatchObject({ todo: 2, inProgress: 1, overdue: 1, completed: 0 });
    expect((await board(client, 'overdue=true')).orders.map((o) => o.title)).toEqual(['Late']);

    // Finished cards are never late.
    await move(client, late.id, { status: 'completed' });
    expect((await board(client)).counts.overdue).toBe(0);
  });

  it('filters by printer queue, unassigned jobs, type and search', async () => {
    const { client } = await registerWithCompany(app);
    const printer = (await client.post('/api/v1/companies/current/printers', { name: 'P1S' })).body;
    await create(client, { title: 'On P1S', printerId: printer.id });
    await create(client, {
      title: 'Spice rack',
      type: 'gift',
      recipient: { kind: 'name', name: 'Mom' },
    });
    const titles = async (q: string) => (await board(client, q)).orders.map((o) => o.title);
    expect(await titles(`printerId=${printer.id}`)).toEqual(['On P1S']);
    expect(await titles('printerId=none')).toEqual(['Spice rack']);
    expect(await titles('type=gift')).toEqual(['Spice rack']);
    expect(await titles('q=mom')).toEqual(['Spice rack']);
    const card = (await board(client, `printerId=${printer.id}`)).orders[0]!;
    expect(card.printer).toEqual({ id: printer.id, name: 'P1S' });
  });

  it('cancelling and reopening need the archive permission', async () => {
    const admin = await registerWithCompany(app);
    const employee = await addEmployee(app, admin.client, true);
    const card = await create(admin.client);
    // Any member moves cards...
    expect((await move(employee.client, card.id, { status: 'ready' })).status).toBe(200);
    // ...but cancelling is for those who can cancel records.
    expect((await move(employee.client, card.id, { status: 'cancelled' })).status).toBe(403);
    expect((await move(admin.client, card.id, { status: 'cancelled' })).status).toBe(200);
    expect((await board(admin.client)).orders).toEqual([]);
    expect((await board(admin.client, 'status=cancelled')).orders).toHaveLength(1);
    expect((await move(employee.client, card.id, { status: 'todo' })).status).toBe(403);
    expect((await move(admin.client, card.id, { status: 'todo' })).body.status).toBe('todo');
  });
});

describe('board retention', () => {
  it('a sale leaves the board only after it is completed and paid, then the set number of days', async () => {
    const { client } = await registerWithCompany(app);
    const sale = await create(client, { agreedPrice: CAD('100') });
    const done = await move(client, sale.id, { status: 'completed' });
    expect(done.body.completedAt).not.toBeNull();
    expect(done.body.settledAt).toBeNull(); // completed but unpaid

    const paid = await client.patch(`/api/v1/orders/${sale.id}/payment`, { paymentStatus: 'paid' });
    expect(paid.body.settledAt).not.toBeNull();
    expect(paid.body.paidAt).not.toBeNull();
    expect((await board(client)).orders.map((o) => o.id)).toEqual([sale.id]);

    // Eight days later (default retention: 7) it is off the active board, still findable.
    await OrderModel.updateOne(
      { _id: sale.id, companyId: await companyOf(sale.id) },
      { $set: { settledAt: new Date(Date.now() - 8 * DAY) } },
    );
    expect((await board(client)).orders).toEqual([]);
    const hidden = (await board(client, 'board=hidden')).orders;
    expect(hidden.map((o) => [o.id, o.hidden])).toEqual([[sale.id, true]]);

    // The payment going back from Paid brings it back and clears the clock.
    const unpaid = await client.patch(`/api/v1/orders/${sale.id}/payment`, {
      paymentStatus: 'partial',
    });
    expect(unpaid.body.settledAt).toBeNull();
    expect((await board(client)).orders.map((o) => o.id)).toEqual([sale.id]);

    // Paid again and reopened: back on the board with no clock.
    await client.patch(`/api/v1/orders/${sale.id}/payment`, { paymentStatus: 'paid' });
    const reopened = await move(client, sale.id, { status: 'ready' });
    expect(reopened.body).toMatchObject({ settledAt: null, completedAt: null, hidden: false });
  });

  it('a gift starts its clock at completion and follows the company setting', async () => {
    const { client } = await registerWithCompany(app);
    const gift = await create(client, {
      type: 'gift',
      title: 'Gift bust for Maria',
      recipient: { kind: 'name', name: 'Maria' },
    });
    const done = await move(client, gift.id, { status: 'completed' });
    expect(done.body.settledAt).not.toBeNull();
    expect((await board(client)).orders).toHaveLength(1);
    await client.patch('/api/v1/companies/current/settings', {
      board: { completedRetentionDays: 0 },
    });
    expect((await board(client)).orders).toEqual([]);
    expect((await board(client, 'board=all')).orders).toHaveLength(1);
    // Records are never deleted by retention.
    expect((await client.get(`/api/v1/orders/${gift.id}`)).status).toBe(200);
  });

  it('gifts have nothing to pay', async () => {
    const { client } = await registerWithCompany(app);
    const gift = await create(client, { type: 'gift' });
    const res = await client.patch(`/api/v1/orders/${gift.id}/payment`, { paymentStatus: 'paid' });
    expect(res.status).toBe(409);
  });
});

describe('reminders', () => {
  it('flags a card left in its column, until contacted or snoozed; edits do not reset it', async () => {
    const { client } = await registerWithCompany(app);
    const card = await create(client, { blocked: { reason: 'quote_approval' } });
    const companyId = await companyOf(card.id);
    const fourDaysAgo = new Date(Date.now() - 4 * DAY);
    await OrderModel.updateOne(
      { _id: card.id, companyId },
      { $set: { statusEnteredAt: fourDaysAgo, 'blocked.since': fourDaysAgo } },
    );
    const stale = async () => (await board(client)).orders[0]!.stale;
    expect(await stale()).toEqual({ days: 4, threshold: 3 });

    // Fixing a typo or opening the card keeps the clock.
    await client.put(`/api/v1/orders/${card.id}`, order({ title: 'Keychain for João!' }));
    await client.get(`/api/v1/orders/${card.id}`);
    expect(await stale()).toEqual({ days: 4, threshold: 3 });

    const snoozed = await client.post(`/api/v1/orders/${card.id}/reminder`, {
      action: 'snooze',
      days: 2,
    });
    expect(snoozed.body.snoozedUntil).not.toBeNull();
    expect(await stale()).toBeNull();
    await client.post(`/api/v1/orders/${card.id}/reminder`, { action: 'unsnooze' });
    expect(await stale()).not.toBeNull();

    const contacted = await client.post(`/api/v1/orders/${card.id}/reminder`, {
      action: 'contacted',
    });
    expect(contacted.body.lastContactAt).not.toBeNull();
    expect(await stale()).toBeNull();
  });

  it('follows the per-column thresholds and can be switched off', async () => {
    const { client } = await registerWithCompany(app);
    const card = await create(client);
    const companyId = await companyOf(card.id);
    await OrderModel.updateOne(
      { _id: card.id, companyId },
      { $set: { statusEnteredAt: new Date(Date.now() - 2 * DAY) } },
    );
    const reminders = {
      enabled: true,
      quoteWaitingDays: 3,
      approvedNotStartedDays: 2,
      inProgressDays: 3,
      blockedDays: 3,
      printedDays: 3,
    };
    await client.patch('/api/v1/companies/current/settings', { reminders });
    expect((await board(client)).orders[0]!.stale).toEqual({ days: 2, threshold: 2 });
    await client.patch('/api/v1/companies/current/settings', {
      reminders: { ...reminders, enabled: false },
    });
    expect((await board(client)).orders[0]!.stale).toBeNull();
  });
});

describe('recording what an order used', () => {
  it('deducts several rolls and lots at once, keeps their costs, and never counts a retry twice', async () => {
    const { client } = await registerWithCompany(app);
    const pla = await spool(client);
    const screw = await screws(client);
    const card = await create(client, { type: 'personal', recipient: { kind: 'myself' } });
    const key = newKey();
    const body = {
      type: 'consumption',
      reason: 'Spice rack',
      lines: [
        { ...pla, quantity: '120' },
        { ...screw, quantity: '2' },
      ],
    };
    const first = await client.post(`/api/v1/orders/${card.id}/consumptions`, body, {
      'Idempotency-Key': key,
    });
    expect(first.status).toBe(201);
    expect(first.body).toHaveLength(2);
    expect(first.body[0]).toMatchObject({ orderId: card.id, delta: -120 * M });

    const retry = await client.post(`/api/v1/orders/${card.id}/consumptions`, body, {
      'Idempotency-Key': key,
    });
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(await remaining(pla.itemId)).toBe(880 * M);
    expect(await remaining(screw.itemId)).toBe(98 * M);

    // PLA 120 g × 0.025 = 3.00, plus 2 screws × 0.40 = 0.80.
    const view = (await client.get(`/api/v1/orders/${card.id}`)).body;
    expect(view.costSummary).toEqual({
      materials: [{ amount: 3.8 * M, currency: 'CAD' }],
      losses: [],
      unpricedLines: 0,
    });
    expect(view.usageCount).toBe(2);
    expect(view.lastProgressAt).not.toBeNull();

    const movements = (await client.get(`/api/v1/orders/${card.id}/movements`)).body;
    expect(movements.map((m: { itemName: string }) => m.itemName).sort()).toEqual([
      'Allen screw',
      'PLA Black',
    ]);
  });

  it('records failures apart and corrects mistakes with a reversing entry', async () => {
    const { client } = await registerWithCompany(app);
    const pla = await spool(client);
    const card = await create(client);
    const used = await client.post(
      `/api/v1/orders/${card.id}/consumptions`,
      { type: 'consumption', lines: [{ ...pla, quantity: '200' }] },
      { 'Idempotency-Key': newKey() },
    );
    await client.post(
      `/api/v1/orders/${card.id}/consumptions`,
      { type: 'loss', reason: 'Spaghetti at layer 40', lines: [{ ...pla, quantity: '45' }] },
      { 'Idempotency-Key': newKey() },
    );
    let view = (await client.get(`/api/v1/orders/${card.id}`)).body;
    expect(view.costSummary.materials).toEqual([{ amount: 5 * M, currency: 'CAD' }]);
    expect(view.costSummary.losses).toEqual([{ amount: 1.13 * M, currency: 'CAD' }]);

    // 200 g entered, 120 g really used: reverse the entry and record the right amount.
    const reversed = await client.post(
      `/api/v1/inventory/movements/${used.body[0].id}/reverse`,
      { reason: 'Entered 200 g, used 120 g' },
      { 'Idempotency-Key': newKey() },
    );
    expect(reversed.status).toBe(201);
    await client.post(
      `/api/v1/orders/${card.id}/consumptions`,
      { type: 'consumption', lines: [{ ...pla, quantity: '120' }] },
      { 'Idempotency-Key': newKey() },
    );
    view = (await client.get(`/api/v1/orders/${card.id}`)).body;
    expect(view.costSummary.materials).toEqual([{ amount: 3 * M, currency: 'CAD' }]);
    expect(await remaining(pla.itemId)).toBe((1000 - 45 - 120) * M);
    const history = (await client.get(`/api/v1/orders/${card.id}/movements`)).body;
    expect(history.map((m: { type: string }) => m.type)).toEqual([
      'consumption',
      'correction',
      'loss',
      'consumption',
    ]);
  });

  it('deducts nothing when one line lacks stock, and names the roll', async () => {
    const { client } = await registerWithCompany(app);
    const big = await spool(client);
    const small = await spool(client, '80', '2');
    const card = await create(client);
    const res = await client.post(
      `/api/v1/orders/${card.id}/consumptions`,
      {
        type: 'consumption',
        lines: [
          { ...big, quantity: '100' },
          { ...small, quantity: '150' },
        ],
      },
      { 'Idempotency-Key': newKey() },
    );
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.details).toMatchObject({ lotId: small.lotId, available: 80 * M });
    expect(await remaining(big.itemId)).toBe(1000 * M);
    expect((await client.get(`/api/v1/orders/${card.id}`)).body.usageCount).toBe(0);
  });

  it('refuses stock recorded against an order of another business', async () => {
    const { client } = await registerWithCompany(app);
    const other = await registerWithCompany(app, 'Other shop');
    const pla = await spool(client);
    const theirs = await create(other.client);
    const res = await client.post(
      '/api/v1/inventory/consumptions',
      { type: 'consumption', orderId: theirs.id, lines: [{ ...pla, quantity: '10' }] },
      { 'Idempotency-Key': newKey() },
    );
    expect(res.status).toBe(404);
    expect(await remaining(pla.itemId)).toBe(1000 * M);
  });

  it('moving a card never touches stock', async () => {
    const { client } = await registerWithCompany(app);
    const pla = await spool(client);
    const card = await create(client, { estimatedGrams: '300' });
    for (const status of ['in_progress', 'ready', 'completed']) {
      await move(client, card.id, { status });
    }
    expect(await remaining(pla.itemId)).toBe(1000 * M);
    const companyId = await companyOf(card.id);
    expect(await StockMovementModel.countDocuments({ companyId, orderId: card.id })).toBe(0);
  });
});

describe('rolls picked for an order', () => {
  it('links rolls from stock with the file grams, without deducting anything', async () => {
    const { client } = await registerWithCompany(app);
    const pla = await spool(client);
    const card = await create(client, { filaments: [{ itemId: pla.itemId, grams: '86.1' }] });
    expect(card.filaments).toEqual([
      {
        itemId: pla.itemId,
        name: 'PLA Black',
        filament: { colorKey: 'black', colorHex: null, materialType: 'PLA' },
        grams: 86.1 * M,
      },
    ]);
    expect(card.usageCount).toBe(0);
    expect(await remaining(pla.itemId)).toBe(1000 * M);

    // "Confirm print" records the usage through the order; the card then knows it is done.
    const used = await client.post(
      `/api/v1/orders/${card.id}/consumptions`,
      { type: 'consumption', lines: [{ itemId: pla.itemId, lotId: pla.lotId, quantity: '86.1' }] },
      { 'Idempotency-Key': newKey() },
    );
    expect(used.status).toBe(201);
    expect((await board(client)).orders[0]!.usageCount).toBe(1);
    expect(await remaining(pla.itemId)).toBe(913.9 * M);
  });

  it('refuses a roll that is not filament or belongs to another business', async () => {
    const mine = await registerWithCompany(app);
    const other = await registerWithCompany(app);
    const theirs = await spool(other.client);
    const res = await mine.client.post(
      '/api/v1/orders',
      order({ filaments: [{ itemId: theirs.itemId, grams: null }] }),
    );
    expect(res.status).toBe(400);
    const screws = await mine.client.post(
      '/api/v1/inventory/items',
      {
        item: { kind: 'material', name: 'M3 screws', category: 'Fasteners', unit: 'unit' },
        firstLot: { originalQuantity: '100', remaining: '100', totalCost: CAD('40') },
      },
      { 'Idempotency-Key': newKey() },
    );
    expect(screws.status).toBe(201);
    const bad = await mine.client.post(
      '/api/v1/orders',
      order({ filaments: [{ itemId: screws.body.id, grams: null }] }),
    );
    expect(bad.status).toBe(400);
  });
});

describe('card picture', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

  it('stores the picture apart and serves it to the same business only', async () => {
    const { client } = await registerWithCompany(app);
    const other = await registerWithCompany(app);
    const card = await create(client);
    expect(card.pictureUrl).toBeNull();

    const set = await client.put(`/api/v1/orders/${card.id}/picture`, { dataUrl });
    expect(set.status).toBe(200);
    expect(set.body.pictureUrl).toMatch(
      new RegExp(String.raw`^/api/v1/orders/${card.id}/picture\?v=\d+$`),
    );
    expect((await board(client)).orders[0]!.pictureUrl).toBe(set.body.pictureUrl);

    const served = await client.get(`/api/v1/orders/${card.id}/picture`);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(Buffer.from(served.body as Buffer).equals(png)).toBe(true);
    expect((await other.client.get(`/api/v1/orders/${card.id}/picture`)).status).toBe(404);

    const removed = await client.delete(`/api/v1/orders/${card.id}/picture`);
    expect(removed.body.pictureUrl).toBeNull();
    expect((await client.get(`/api/v1/orders/${card.id}/picture`)).status).toBe(404);
  });

  it('refuses other formats and pictures over the size limit', async () => {
    const { client } = await registerWithCompany(app);
    const card = await create(client);
    const put = (body: object) => client.put(`/api/v1/orders/${card.id}/picture`, body);
    expect((await put({ dataUrl: 'data:image/gif;base64,R0lGOD' })).status).toBe(400);
    const big = Buffer.alloc(70 * 1024, 1).toString('base64');
    expect((await put({ dataUrl: `data:image/webp;base64,${big}` })).status).toBeGreaterThanOrEqual(
      400,
    );
  });

  it('deleting the order deletes its picture', async () => {
    const { client } = await registerWithCompany(app);
    const card = await create(client);
    await client.put(`/api/v1/orders/${card.id}/picture`, { dataUrl });
    expect((await client.delete(`/api/v1/orders/${card.id}`)).status).toBe(204);
    const companyId = await companyOf(card.id).catch(() => null);
    expect(companyId).toBeNull();
    expect(await OrderPictureModel.countDocuments({ orderId: card.id }, ANY)).toBe(0);
  });
});

describe('deleting and links', () => {
  it('deletes an order made by mistake; one with stock use is cancelled instead', async () => {
    const admin = await registerWithCompany(app);
    const employee = await addEmployee(app, admin.client, true);
    const mistake = await create(admin.client);
    expect((await employee.client.delete(`/api/v1/orders/${mistake.id}`)).status).toBe(403);
    expect((await admin.client.delete(`/api/v1/orders/${mistake.id}`)).status).toBe(204);
    expect((await admin.client.get(`/api/v1/orders/${mistake.id}`)).status).toBe(404);

    const pla = await spool(admin.client);
    const real = await create(admin.client);
    await admin.client.post(
      `/api/v1/orders/${real.id}/consumptions`,
      { type: 'consumption', lines: [{ ...pla, quantity: '10' }] },
      { 'Idempotency-Key': newKey() },
    );
    const refused = await admin.client.delete(`/api/v1/orders/${real.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/Cancel it instead/);
  });

  it('keeps customers, products and printers that orders use; labels are pulled from them', async () => {
    const { client } = await registerWithCompany(app);
    const customer = (await client.post('/api/v1/customers', { name: 'Ana' })).body;
    const product = (
      await client.post('/api/v1/products', { type: 'product', name: 'Dragon', labelIds: [] })
    ).body;
    const printer = (await client.post('/api/v1/companies/current/printers', { name: 'P1S' })).body;
    const label = (await client.post('/api/v1/labels', { name: 'Gift' })).body;
    const card = await create(client, {
      recipient: { kind: 'customer', customerId: customer.id },
      productId: product.id,
      printerId: printer.id,
      labelIds: [label.id],
    });
    expect(card.recipient).toMatchObject({ kind: 'customer', name: 'Ana' });

    for (const url of [
      `/api/v1/customers/${customer.id}`,
      `/api/v1/products/${product.id}`,
      `/api/v1/companies/current/printers/${printer.id}`,
    ]) {
      const res = await client.delete(url);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Archive/);
    }
    expect((await client.delete(`/api/v1/labels/${label.id}`)).status).toBe(204);
    expect((await client.get(`/api/v1/orders/${card.id}`)).body.labelIds).toEqual([]);
    expect((await client.get(`/api/v1/orders?customerId=${customer.id}`)).body.orders).toHaveLength(
      1,
    );
  });
});

describe('orders from quotes', () => {
  async function approvedQuote(client: TestClient) {
    const calc = await client.post('/api/v1/calculations', {
      name: 'Keychain',
      productId: null,
      notes: '',
      updateProductCost: false,
      input: {
        currency: 'CAD',
        quantity: 10,
        basis: 'unit',
        printMinutes: 30,
        filament: {
          enabled: true,
          lines: [
            {
              source: 'manual',
              itemId: null,
              lotId: null,
              label: 'PLA',
              grams: '12',
              costPerGram: null,
              spoolGrams: '1000',
              spoolPrice: CAD('25'),
              available: null,
            },
          ],
        },
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
        pricing: { method: 'manual', percent: '0', unitPrice: '10' },
        brlPerCad: null,
      },
    });
    expect(calc.status).toBe(201);
    const customer = (await client.post('/api/v1/customers', { name: 'Bruno Lima' })).body;
    const quote = await client.post('/api/v1/quotes', {
      title: 'Ten keychains',
      language: 'pt-BR',
      currency: 'CAD',
      issuedAt: TODAY,
      customerId: customer.id,
      customer: { name: 'Bruno Lima' },
      lines: [
        {
          calculationId: calc.body.id,
          description: 'Keychain with a name',
          quantity: '20',
          unit: 'pcs',
          unitPrice: '10',
        },
      ],
    });
    expect(quote.status).toBe(201);
    return { quote: quote.body as { id: string; code: string }, customer };
  }

  it('prefills an order from an approved quote, scaled to its quantity', async () => {
    const { client } = await registerWithCompany(app);
    const { quote, customer } = await approvedQuote(client);
    const draft = (await client.get(`/api/v1/orders/from-quote/${quote.id}`)).body;
    expect(draft).toMatchObject({
      quote: { id: quote.id, code: quote.code, status: 'draft' },
      existingOrderId: null,
      draft: {
        title: 'Ten keychains',
        description: '20 pcs × Keychain with a name',
        quantity: 20,
        recipient: { kind: 'customer', customerId: customer.id },
        agreedPrice: { amount: 200 * M, currency: 'CAD' },
        // The calculation covers 10 pieces: 30 min and 12 g each, 0.30 per piece in PLA.
        estimatedMinutes: 600,
        estimatedGrams: 240 * M,
        estimatedCost: { amount: 6 * M, currency: 'CAD' },
      },
    });

    // Only an approved quote becomes an order.
    const early = await client.post('/api/v1/orders', order({ quoteId: quote.id }));
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('QUOTE_NOT_APPROVED');
  });

  it('makes one order per quote, links both ways, and keeps the quote while the order exists', async () => {
    const { client } = await registerWithCompany(app);
    const { quote } = await approvedQuote(client);
    await client.post(`/api/v1/quotes/${quote.id}/actions`, { action: 'approve' });
    const made = await create(client, { quoteId: quote.id });
    expect(made.quote).toEqual({ id: quote.id, code: quote.code });
    expect((made.history as { note: string }[])[0]).toMatchObject({ note: `From ${quote.code}` });

    const again = await client.post('/api/v1/orders', order({ quoteId: quote.id }));
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'ORDER_EXISTS', details: { orderId: made.id } });
    expect((await client.get(`/api/v1/orders/from-quote/${quote.id}`)).body.existingOrderId).toBe(
      made.id,
    );
    expect((await client.get(`/api/v1/quotes/${quote.id}`)).body.orderId).toBe(made.id);
    expect((await client.delete(`/api/v1/quotes/${quote.id}`)).status).toBe(409);

    // Approving made nothing by itself: the single order is the one created explicitly.
    expect((await board(client)).orders).toHaveLength(1);
  });
});
