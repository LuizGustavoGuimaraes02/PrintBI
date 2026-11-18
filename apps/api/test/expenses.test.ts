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

async function category(client: TestClient, name: string): Promise<string> {
  const list = (await client.get('/api/v1/companies/current/expense-categories')).body as {
    id: string;
    name: string;
  }[];
  return list.find((c) => c.name === name)?.id ?? '';
}

async function createExpense(client: TestClient, overrides: Record<string, unknown> = {}) {
  const res = await client.post('/api/v1/expenses', {
    description: 'Allen key set',
    categoryId: await category(client, 'Tools'),
    amount: { amount: '35', currency: 'CAD' },
    purchasedAt: '2026-11-05',
    vendor: 'Hardware store',
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body;
}

const pay = (
  client: TestClient,
  id: string,
  amount: string,
  key = newKey(),
  paidAt = '2026-11-06',
) =>
  client.post(
    `/api/v1/expenses/${id}/payments`,
    { amount, paidAt, method: 'debit' },
    { 'Idempotency-Key': key },
  );

describe('expenses and payments', () => {
  it('derives the status from its payments', async () => {
    const { client } = await registerWithCompany(app);
    const expense = await createExpense(client, {
      amount: { amount: '100', currency: 'CAD' },
      payments: [{ amount: '40', paidAt: '2026-11-05', method: 'cash' }],
    });
    expect(expense).toMatchObject({
      status: 'partial',
      paid: 40 * M,
      outstanding: 60 * M,
      category: { name: 'Tools' },
    });

    const paid = await pay(client, expense.id, '60');
    expect(paid.body).toMatchObject({ status: 'paid', outstanding: 0 });
    expect(paid.body.payments).toHaveLength(2);
  });

  it('refuses payments beyond what is owed, and counts a double click once', async () => {
    const { client } = await registerWithCompany(app);
    const expense = await createExpense(client);
    expect((await pay(client, expense.id, '50')).status).toBe(400);

    const key = newKey();
    await Promise.all([pay(client, expense.id, '20', key), pay(client, expense.id, '20', key)]);
    const after = (await client.get(`/api/v1/expenses/${expense.id}`)).body;
    expect(after).toMatchObject({ paid: 20 * M, status: 'partial' });
  });

  it('cannot lower the amount below what was already paid', async () => {
    const { client } = await registerWithCompany(app);
    const expense = await createExpense(client, {
      payments: [{ amount: '30', paidAt: '2026-11-05', method: 'cash' }],
    });
    const res = await client.patch(`/api/v1/expenses/${expense.id}`, {
      amount: { amount: '20', currency: 'CAD' },
    });
    expect(res.status).toBe(400);
  });

  it('removes a mistaken payment and recomputes the status', async () => {
    const { client } = await registerWithCompany(app);
    const expense = await createExpense(client, {
      payments: [{ amount: '35', paidAt: '2026-11-05', method: 'cash' }],
    });
    const res = await client.delete(
      `/api/v1/expenses/${expense.id}/payments/${expense.payments[0].id}`,
    );
    expect(res.body).toMatchObject({ status: 'pending', paid: 0 });
  });

  it('only uses active categories', async () => {
    const { client } = await registerWithCompany(app);
    const toolsId = await category(client, 'Tools');
    await client.patch(`/api/v1/companies/current/expense-categories/${toolsId}`, {
      archived: true,
    });
    const res = await client.post('/api/v1/expenses', {
      description: 'Pliers',
      categoryId: toolsId,
      amount: { amount: '10', currency: 'CAD' },
      purchasedAt: '2026-11-05',
    });
    expect(res.status).toBe(400);
  });
});

describe('period summary', () => {
  it('separates recorded, paid (by payment date) and pending, per currency, without cancelled', async () => {
    const { client } = await registerWithCompany(app);
    const filament = await category(client, 'Filament');
    // Bought in October, paid in November: counts as November cash out, not November purchase.
    const october = await createExpense(client, {
      categoryId: filament,
      amount: { amount: '25', currency: 'CAD' },
      purchasedAt: '2026-10-20',
    });
    await pay(client, october.id, '25', newKey(), '2026-11-02');
    await createExpense(client, {
      categoryId: filament,
      amount: { amount: '20', currency: 'CAD' },
      purchasedAt: '2026-11-08',
    });
    await createExpense(client, {
      amount: { amount: '35', currency: 'CAD' },
      payments: [{ amount: '35', paidAt: '2026-11-05', method: 'cash' }],
    });
    await createExpense(client, {
      amount: { amount: '80', currency: 'BRL' },
      purchasedAt: '2026-11-09',
    });
    const cancelled = await createExpense(client, { amount: { amount: '999', currency: 'CAD' } });
    await client.post(`/api/v1/expenses/${cancelled.id}/cancel`, { reason: 'Duplicate entry' });

    const summary = (await client.get('/api/v1/expenses/summary?from=2026-11-01&to=2026-11-30'))
      .body;
    expect(summary.recorded).toEqual(
      expect.arrayContaining([
        { amount: 55 * M, currency: 'CAD' },
        { amount: 80 * M, currency: 'BRL' },
      ]),
    );
    expect(summary.paid).toEqual([{ amount: 60 * M, currency: 'CAD' }]);
    expect(summary.pending).toEqual(
      expect.arrayContaining([
        { amount: 20 * M, currency: 'CAD' },
        { amount: 80 * M, currency: 'BRL' },
      ]),
    );
    expect(summary.topCategory).toEqual({
      name: 'Tools',
      amount: { amount: 35 * M, currency: 'CAD' },
    });
  });
});

describe('permissions', () => {
  it('employees without financial access cannot see expenses at all', async () => {
    const admin = await registerWithCompany(app);
    const employee = await addEmployee(app, admin.client, false);
    expect((await employee.client.get('/api/v1/expenses')).status).toBe(403);
    expect((await employee.client.get('/api/v1/expenses/summary')).status).toBe(403);
  });

  it('financial employees record expenses but cannot cancel them', async () => {
    const admin = await registerWithCompany(app);
    const employee = await addEmployee(app, admin.client, true);
    const expense = await createExpense(employee.client);
    const res = await employee.client.post(`/api/v1/expenses/${expense.id}/cancel`, {
      reason: 'mistake',
    });
    expect(res.status).toBe(403);
  });

  it('another company cannot open these expenses', async () => {
    const a = await registerWithCompany(app, 'Company A');
    const b = await registerWithCompany(app, 'Company B');
    const expense = await createExpense(a.client);
    expect((await b.client.get(`/api/v1/expenses/${expense.id}`)).status).toBe(404);
    expect((await pay(b.client, expense.id, '1')).status).toBe(404);
  });
});
