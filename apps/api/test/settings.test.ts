import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CompanyModel } from '../src/modules/companies/company.model';
import { createApp } from '../src/app';
import { registerClient, registerWithCompany } from './client';
import { connectTestDatabase } from './memory-db';

const app = createApp();
let teardown: () => Promise<void>;

beforeAll(async () => {
  teardown = await connectTestDatabase();
});
afterAll(async () => teardown());

async function companyWithEmployee(finance = false) {
  const admin = await registerWithCompany(app);
  const employee = await registerClient(app);
  const invite = await admin.client.post('/api/v1/companies/current/invites', {
    email: employee.email,
    finance,
  });
  const token = new URL(invite.body.link).pathname.split('/').pop() ?? '';
  await employee.client.post('/api/v1/invites/accept', { token });
  return { admin, employee };
}

const calculator = {
  energyPricePerKwh: { amount: '0.15', currency: 'CAD' },
  laborRatePerHour: { amount: '25', currency: 'CAD' },
  targetMarginPercent: '40',
  riskPercent: '5',
  riskBase: 'materials',
  quoteValidityDays: 10,
  paymentTerms: '50% upfront',
};

describe('company settings', () => {
  it('starts with sensible defaults', async () => {
    const { client } = await registerWithCompany(app);
    const res = await client.get('/api/v1/companies/current/settings');
    expect(res.status).toBe(200);
    expect(res.body.currency).toEqual({
      defaultCurrency: 'CAD',
      brlPerCad: null,
      rateUpdatedAt: null,
    });
    expect(res.body.calculator.energyPricePerKwh).toEqual({ amount: 150_000, currency: 'CAD' });
    expect(res.body.reminders.quoteWaitingDays).toBe(3);
    expect(res.body.board.completedRetentionDays).toBe(7);
  });

  it('saves sections with exact decimals and stamps the rate date', async () => {
    const { client } = await registerWithCompany(app);
    const res = await client.patch('/api/v1/companies/current/settings', {
      currency: { defaultCurrency: 'BRL', brlPerCad: '4.0525' },
      calculator,
    });
    expect(res.status).toBe(200);
    expect(res.body.currency.brlPerCad).toBe(4_052_500);
    expect(res.body.currency.rateUpdatedAt).not.toBeNull();
    expect(res.body.calculator).toMatchObject({
      laborRatePerHour: { amount: 25_000_000, currency: 'CAD' },
      targetMarginPercent: 40_000_000,
      riskBase: 'materials',
    });
    // Untouched sections keep their values.
    expect(res.body.board.completedRetentionDays).toBe(7);
  });

  it('rejects a margin of 100% or more', async () => {
    const { client } = await registerWithCompany(app);
    const res = await client.patch('/api/v1/companies/current/settings', {
      calculator: { ...calculator, targetMarginPercent: '100' },
    });
    expect(res.status).toBe(400);
  });

  it('lets employees read but not change settings', async () => {
    const { employee } = await companyWithEmployee();
    expect((await employee.client.get('/api/v1/companies/current/settings')).status).toBe(200);
    const res = await employee.client.patch('/api/v1/companies/current/settings', {
      board: { completedRetentionDays: 1 },
    });
    expect(res.status).toBe(403);
  });
});

describe('printers', () => {
  const printer = {
    name: 'Adventurer 5M',
    brand: 'Flashforge',
    purchaseCost: { amount: '599.99', currency: 'CAD' },
    powerWatts: 150,
    recovery: {
      years: '2',
      hoursPerDay: '8',
      daysPerYear: '300',
      maintenance: { kind: 'percent', percent: '20' },
    },
  };

  it('creates, updates and archives a printer', async () => {
    const { client } = await registerWithCompany(app);
    const created = await client.post('/api/v1/companies/current/printers', printer);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Adventurer 5M',
      purchaseCost: { amount: 599_990_000, currency: 'CAD' },
      recovery: { years: 2_000_000, maintenance: { kind: 'percent', percent: 20_000_000 } },
    });

    const updated = await client.put(`/api/v1/companies/current/printers/${created.body.id}`, {
      ...printer,
      status: 'maintenance',
    });
    expect(updated.body.status).toBe('maintenance');

    expect(
      (await client.delete(`/api/v1/companies/current/printers/${created.body.id}`)).status,
    ).toBe(204);
    expect((await client.get('/api/v1/companies/current/printers')).body).toEqual([]);
  });

  it('hides printer costs from employees without financial access', async () => {
    const { admin, employee } = await companyWithEmployee(false);
    await admin.client.post('/api/v1/companies/current/printers', printer);
    const [seen] = (await employee.client.get('/api/v1/companies/current/printers')).body;
    expect(seen.name).toBe('Adventurer 5M');
    expect(seen.purchaseCost).toBeNull();
    expect(seen.recovery).toBeNull();
  });

  it('cannot touch another company printer', async () => {
    const a = await registerWithCompany(app, 'Company A');
    const b = await registerWithCompany(app, 'Company B');
    const created = await a.client.post('/api/v1/companies/current/printers', printer);
    const res = await b.client.put(
      `/api/v1/companies/current/printers/${created.body.id}`,
      printer,
    );
    expect(res.status).toBe(404);
  });
});

describe('expense categories', () => {
  it('seeds the default categories', async () => {
    const { client } = await registerWithCompany(app);
    const names = (await client.get('/api/v1/companies/current/expense-categories')).body.map(
      (c: { name: string }) => c.name,
    );
    expect(names).toEqual(expect.arrayContaining(['Filament', 'Tools', 'Fees', 'Other']));
  });

  it('creates, refuses duplicates (any case) and archives', async () => {
    const { client } = await registerWithCompany(app);
    const created = await client.post('/api/v1/companies/current/expense-categories', {
      name: 'Shipping',
    });
    expect(created.status).toBe(201);
    const dup = await client.post('/api/v1/companies/current/expense-categories', {
      name: 'shipping',
    });
    expect(dup.status).toBe(409);

    const archived = await client.patch(
      `/api/v1/companies/current/expense-categories/${created.body.id}`,
      {
        archived: true,
      },
    );
    expect(archived.body.archived).toBe(true);
    // Once archived, the name is free again.
    const again = await client.post('/api/v1/companies/current/expense-categories', {
      name: 'Shipping',
    });
    expect(again.status).toBe(201);
  });
});

describe('calculator review for the setup checklist', () => {
  it('stays unreviewed until the calculator defaults are saved', async () => {
    const { client } = await registerWithCompany(app);
    const before = (await client.get('/api/v1/companies/current/settings')).body;
    expect(before.calculator.reviewedAt).toBeNull();
    // Saving another section does not count.
    await client.patch('/api/v1/companies/current/settings', {
      reminders: before.reminders,
    });
    expect(
      (await client.get('/api/v1/companies/current/settings')).body.calculator.reviewedAt,
    ).toBeNull();

    const saved = await client.patch('/api/v1/companies/current/settings', { calculator });
    expect(saved.body.calculator.reviewedAt).toEqual(expect.any(String));
  });

  it('recognizes a calculator saved before the field existed, from the audit log', async () => {
    const { client, companyId } = await registerWithCompany(app);
    await client.patch('/api/v1/companies/current/settings', { calculator });
    // Simulate data from before reviewedAt existed.
    await CompanyModel.updateOne(
      { _id: companyId },
      { $set: { 'settings.calculator.reviewedAt': null } },
    );
    const view = (await client.get('/api/v1/companies/current/settings')).body;
    expect(view.calculator.reviewedAt).toEqual(expect.any(String));
    const stored = await CompanyModel.findById(companyId, { settings: 1 }).lean();
    expect(stored?.settings?.calculator?.reviewedAt).toBeInstanceOf(Date);
  });
});
