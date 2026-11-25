import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { addEmployee, registerWithCompany, type TestClient } from './client';
import { connectTestDatabase } from './memory-db';

const app = createApp();
let teardown: () => Promise<void>;

beforeAll(async () => {
  teardown = await connectTestDatabase();
});
afterAll(async () => teardown());

const M = 1_000_000;
const CAD = (amount: string) => ({ amount, currency: 'CAD' });

function quote(extra: Record<string, unknown> = {}) {
  return {
    title: 'Custom keychains',
    language: 'pt-BR',
    currency: 'CAD',
    issuedAt: '2026-11-19',
    validUntil: '2099-12-31',
    customerId: null,
    customer: { name: 'Ana Souza', company: '', email: 'ana@example.com', phone: '', address: '' },
    lines: [
      {
        description: 'Keychain with a name',
        quantity: '10',
        unit: 'pieces',
        unitPrice: '10',
        discount: '0',
      },
    ],
    discount: '5',
    delivery: '15',
    taxes: [{ label: 'HST', percent: '13' }],
    showBreakdown: false,
    leadTime: '7 days',
    deliveryMethod: 'Pickup',
    paymentTerms: '50% upfront',
    notes: 'Thank you!',
    privateNotes: 'Supplier: Amazon',
    ...extra,
  };
}

/** A saved calculation: 200 g of PLA (5.00), a bulb (4.00) and labor (15.00), priced at 40. */
async function lampCalculation(client: TestClient) {
  const manual = (label: string, quantity: string, price: string) => ({
    source: 'manual',
    itemId: null,
    lotId: null,
    label,
    quantity,
    unitPrice: CAD(price),
    available: null,
  });
  const res = await client.post('/api/v1/calculations', {
    name: 'Moon lamp',
    productId: null,
    notes: '',
    updateProductCost: false,
    input: {
      currency: 'CAD',
      quantity: 1,
      basis: 'unit',
      printMinutes: 0,
      filament: {
        enabled: true,
        lines: [
          {
            source: 'manual',
            itemId: null,
            lotId: null,
            label: 'PLA',
            grams: '200',
            costPerGram: null,
            spoolGrams: '1000',
            spoolPrice: CAD('25'),
            available: null,
          },
        ],
      },
      energy: { enabled: false, watts: '0', pricePerKwh: CAD('0') },
      labor: { enabled: true, lines: [{ label: 'Assembly', minutes: 60, ratePerHour: CAD('15') }] },
      machine: {
        enabled: false,
        mode: 'rate',
        printerId: null,
        label: '',
        ratePerHour: null,
        recovery: null,
      },
      materials: { enabled: true, lines: [manual('Bulb', '1', '4')] },
      risk: { enabled: false, percent: '0', base: 'total' },
      fees: { enabled: false, lines: [] },
      pricing: { method: 'manual', percent: '0', unitPrice: '40' },
      brlPerCad: null,
    },
  });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body as { id: string };
}

describe('quotes', () => {
  it('numbers quotes per business and works out totals that reconcile', async () => {
    const { client } = await registerWithCompany(app);
    const first = await client.post('/api/v1/quotes', quote());
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      code: 'ORC-0001',
      status: 'draft',
      subtotal: 100 * M,
      discount: 5 * M,
      delivery: 15 * M,
      taxBase: 110 * M,
      taxes: [{ label: 'HST', amount: 14.3 * M }],
      total: 124.3 * M,
    });
    expect(first.body.lines[0].amount).toBe(100 * M);
    const second = await client.post('/api/v1/quotes', quote());
    expect(second.body.code).toBe('ORC-0002');

    const other = await registerWithCompany(app, 'Other');
    expect((await other.client.post('/api/v1/quotes', quote())).body.code).toBe('ORC-0001');
    expect((await other.client.get(`/api/v1/quotes/${first.body.id}`)).status).toBe(404);
  });

  it('copies a registered customer’s details onto the quote', async () => {
    const { client } = await registerWithCompany(app);
    const customer = (
      await client.post('/api/v1/customers', { name: 'Bruno Lima', email: 'b@example.com' })
    ).body;
    const res = await client.post('/api/v1/quotes', quote({ customerId: customer.id }));
    expect(res.body.customer).toMatchObject({ name: 'Bruno Lima', email: 'b@example.com' });
  });

  it('moves through its statuses and keeps the history; outcomes lock editing', async () => {
    const { client } = await registerWithCompany(app);
    const { id } = (await client.post('/api/v1/quotes', quote())).body;
    const act = (action: string) =>
      client.post(`/api/v1/quotes/${id}/actions`, { action, note: '' });

    expect((await act('reopen')).status).toBe(409);
    expect((await act('send')).body.status).toBe('sent');
    const approved = await act('approve');
    expect(approved.body.status).toBe('approved');
    expect(approved.body.history.map((h: { status: string }) => h.status)).toEqual([
      'draft',
      'sent',
      'approved',
    ]);
    expect((await client.put(`/api/v1/quotes/${id}`, quote())).status).toBe(409);
    expect((await act('reopen')).body.status).toBe('draft');
    expect((await client.put(`/api/v1/quotes/${id}`, quote({ title: 'Edited' }))).body.title).toBe(
      'Edited',
    );
  });

  it('shows a sent quote past its date as expired, but never an approved one', async () => {
    const { client } = await registerWithCompany(app);
    const late = (await client.post('/api/v1/quotes', quote({ validUntil: '2020-01-01' }))).body;
    expect(late.displayStatus).toBe('expired');
    await client.post(`/api/v1/quotes/${late.id}/actions`, { action: 'approve', note: '' });
    const fresh = (await client.post('/api/v1/quotes', quote())).body;
    await client.post(`/api/v1/quotes/${fresh.id}/actions`, { action: 'send', note: '' });

    const list = (await client.get('/api/v1/quotes')).body;
    expect(list.counts).toMatchObject({ approved: 1, sent: 1, expired: 0 });
    expect(list.sentCount).toBe(1);
    expect((await client.get('/api/v1/quotes?status=sent')).body.quotes).toHaveLength(1);
    expect(
      (await client.get('/api/v1/quotes?q=0002')).body.quotes.map((q: { code: string }) => q.code),
    ).toEqual(['ORC-0002']);
  });

  it('adds the cost breakdown from a calculation, only for financial access', async () => {
    const { client } = await registerWithCompany(app);
    const calc = await lampCalculation(client);
    const line = {
      description: 'Moon lamp',
      quantity: '1',
      unit: '',
      unitPrice: '40',
      discount: '0',
      calculationId: calc.id,
    };
    const res = await client.post(
      '/api/v1/quotes',
      quote({ lines: [line], showBreakdown: true, taxes: [], discount: '0', delivery: '0' }),
    );
    expect(res.status).toBe(201);
    const breakdown = res.body.lines[0].breakdown;
    expect(breakdown.map((r: { label: string; amount: number }) => [r.label, r.amount])).toEqual([
      ['PLA', 5 * M],
      ['Bulb', 4 * M],
      ['Assembly', 15 * M],
    ]);
    expect(res.body.lines[0].breakdownQuantity).toBe(1 * M);

    // An employee without financial access sees no costs, and editing keeps the breakdown.
    const employee = await addEmployee(app, client, false);
    const seen = await employee.client.get(`/api/v1/quotes/${res.body.id}`);
    expect(seen.body.lines[0].breakdown).toBeNull();
    expect(JSON.stringify(seen.body)).not.toContain('Assembly');
    const body = quote({
      lines: [line],
      showBreakdown: true,
      taxes: [],
      discount: '0',
      delivery: '0',
      title: 'By employee',
    });
    await employee.client.put(`/api/v1/quotes/${res.body.id}`, body);
    const again = await client.get(`/api/v1/quotes/${res.body.id}`);
    expect(again.body.title).toBe('By employee');
    expect(again.body.lines[0].breakdown).toHaveLength(3);
  });

  it('deletes a quote made by mistake (admin only)', async () => {
    const { client } = await registerWithCompany(app);
    const employee = await addEmployee(app, client, true);
    const { id } = (await client.post('/api/v1/quotes', quote())).body;
    expect((await employee.client.delete(`/api/v1/quotes/${id}`)).status).toBe(403);
    expect((await client.delete(`/api/v1/quotes/${id}`)).status).toBe(204);
    expect((await client.get(`/api/v1/quotes/${id}`)).status).toBe(404);
  });

  it('rejects a quote without items or customer name', async () => {
    const { client } = await registerWithCompany(app);
    const res = await client.post('/api/v1/quotes', quote({ lines: [], customer: { name: '' } }));
    expect(res.status).toBe(400);
  });
});
