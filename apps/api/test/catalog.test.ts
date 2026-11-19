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

const createLabel = async (client: TestClient, name: string, color?: string) =>
  (await client.post('/api/v1/labels', { name, ...(color && { color }) })).body as {
    id: string;
    name: string;
  };

const keychain = (labelIds: string[] = [], extra: object = {}) => ({
  type: 'product',
  name: 'Dragon keychain',
  description: 'Articulated dragon, 12 cm',
  labelIds,
  price: CAD('15'),
  estimatedCost: CAD('3.40'),
  specs: { widthMm: 120, depthMm: 30, heightMm: 8, filamentGrams: '24.5' },
  notes: 'Print at 0.16 mm',
  ...extra,
});

describe('labels', () => {
  it('creates labels, refuses duplicate names, and counts products', async () => {
    const { client } = await registerWithCompany(app);
    const label = await createLabel(client, 'Keychain', '#FEF0E6');
    const duplicate = await client.post('/api/v1/labels', { name: 'keychain' });
    expect(duplicate.status).toBe(409);

    await client.post('/api/v1/products', keychain([label.id]));
    await client.post('/api/v1/products', keychain([label.id], { name: 'Cat keychain' }));
    const labels = (await client.get('/api/v1/labels')).body;
    expect(labels).toEqual([
      { id: label.id, name: 'Keychain', color: '#FEF0E6', archived: false, productCount: 2 },
    ]);
  });

  it('renames and archives a label; archived names can be reused', async () => {
    const { client } = await registerWithCompany(app);
    const label = await createLabel(client, 'Magnet');
    const renamed = await client.patch(`/api/v1/labels/${label.id}`, { name: 'Fridge magnet' });
    expect(renamed.body).toMatchObject({ name: 'Fridge magnet', archived: false });

    await client.patch(`/api/v1/labels/${label.id}`, { archived: true });
    expect((await client.post('/api/v1/labels', { name: 'Fridge magnet' })).status).toBe(201);
    // Restoring would collide with the new active label of the same name.
    expect((await client.patch(`/api/v1/labels/${label.id}`, { archived: false })).status).toBe(
      409,
    );
  });

  it('validates the color', async () => {
    const { client } = await registerWithCompany(app);
    expect((await client.post('/api/v1/labels', { name: 'Vase', color: 'teal' })).status).toBe(400);
  });
});

describe('products and services', () => {
  it('creates a product with labels, size and filament grams', async () => {
    const { client } = await registerWithCompany(app);
    const label = await createLabel(client, 'Keychain');
    const res = await client.post('/api/v1/products', keychain([label.id]));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'product',
      name: 'Dragon keychain',
      labels: [{ id: label.id, name: 'Keychain', color: '#E2F1F3' }],
      price: { amount: 15 * M, currency: 'CAD' },
      estimatedCost: { amount: 3.4 * M, currency: 'CAD' },
      saleUnit: 'unit',
      specs: { widthMm: 120, depthMm: 30, heightMm: 8, filamentGrams: 24.5 * M },
      archived: false,
    });
  });

  it('creates a service sold by the hour, or with a custom unit', async () => {
    const { client } = await registerWithCompany(app);
    const hourly = await client.post('/api/v1/products', {
      type: 'service',
      name: '3D modelling',
      saleUnit: 'hour',
      price: CAD('45'),
      customUnit: 'ignored',
    });
    expect(hourly.body).toMatchObject({ saleUnit: 'hour', customUnit: '', estimatedCost: null });

    const missingUnit = await client.post('/api/v1/products', {
      type: 'service',
      name: 'Bulk print',
      saleUnit: 'custom',
    });
    expect(missingUnit.status).toBe(400);
    expect(missingUnit.body.details).toEqual([{ path: 'customUnit', message: 'Name the unit' }]);
  });

  it('filters by search, type, label and status', async () => {
    const { client } = await registerWithCompany(app);
    const magnet = await createLabel(client, 'Magnet');
    await client.post('/api/v1/products', keychain());
    await client.post(
      '/api/v1/products',
      keychain([magnet.id], { name: 'Cactus magnet', description: 'Succulent pot magnet' }),
    );
    const service = (
      await client.post('/api/v1/products', { type: 'service', name: 'Print repair' })
    ).body;
    await client.post(`/api/v1/products/${service.id}/archive`, { archived: true });

    const names = async (query: string) =>
      ((await client.get(`/api/v1/products${query}`)).body as { name: string }[]).map(
        (p) => p.name,
      );
    expect(await names('')).toEqual(['Cactus magnet', 'Dragon keychain']);
    expect(await names('?q=DRAGON')).toEqual(['Dragon keychain']);
    expect(await names(`?labelId=${magnet.id}`)).toEqual(['Cactus magnet']);
    expect(await names('?type=service')).toEqual([]);
    expect(await names('?archived=true')).toEqual(['Print repair']);
    expect(await names('?q=(')).toEqual([]); // regex characters are searched literally
  });

  it('refuses labels from another company or archived ones, but keeps those already set', async () => {
    const a = await registerWithCompany(app);
    const b = await registerWithCompany(app, 'Other Lab');
    const foreign = await createLabel(b.client, 'Vase');
    const res = await a.client.post('/api/v1/products', keychain([foreign.id]));
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ path: 'labelIds', message: 'Choose active labels' }]);

    const label = await createLabel(a.client, 'Seasonal');
    const product = (await a.client.post('/api/v1/products', keychain([label.id]))).body;
    await a.client.patch(`/api/v1/labels/${label.id}`, { archived: true });
    const edited = await a.client.put(
      `/api/v1/products/${product.id}`,
      keychain([label.id], { name: 'Dragon keychain XL' }),
    );
    expect(edited.status).toBe(200);
    expect(edited.body.labels).toHaveLength(1);
    expect((await a.client.post('/api/v1/products', keychain([label.id]))).status).toBe(400);
  });

  it('hides the estimated cost from members without finance access, who never overwrite it', async () => {
    const admin = await registerWithCompany(app);
    const employee = await addEmployee(app, admin.client, false);
    const product = (await admin.client.post('/api/v1/products', keychain())).body;

    const seen = await employee.client.get(`/api/v1/products/${product.id}`);
    expect(seen.body).toMatchObject({ estimatedCost: null, price: { amount: 15 * M } });

    await employee.client.put(
      `/api/v1/products/${product.id}`,
      keychain([], { price: CAD('18'), estimatedCost: CAD('0.01') }),
    );
    const after = (await admin.client.get(`/api/v1/products/${product.id}`)).body;
    expect(after).toMatchObject({
      price: { amount: 18 * M },
      estimatedCost: { amount: 3.4 * M },
    });
  });

  it('only members allowed to archive can archive', async () => {
    const admin = await registerWithCompany(app);
    const employee = await addEmployee(app, admin.client, false);
    const product = (await admin.client.post('/api/v1/products', keychain())).body;
    const url = `/api/v1/products/${product.id}/archive`;
    expect((await employee.client.post(url, { archived: true })).status).toBe(403);
    const archived = await admin.client.post(url, { archived: true, reason: 'Discontinued' });
    expect(archived.body.archived).toBe(true);
    expect((await admin.client.post(url, { archived: false })).body.archived).toBe(false);
  });

  it('another company cannot read or edit the product', async () => {
    const a = await registerWithCompany(app);
    const b = await registerWithCompany(app, 'Other Lab');
    const product = (await a.client.post('/api/v1/products', keychain())).body;
    expect((await b.client.get(`/api/v1/products/${product.id}`)).status).toBe(404);
    expect((await b.client.put(`/api/v1/products/${product.id}`, keychain())).status).toBe(404);
    expect((await b.client.get('/api/v1/products')).body).toEqual([]);
  });
});

describe('customers', () => {
  const ana = {
    name: 'Ana Souza',
    company: 'Café Lua',
    phone: '+55 11 98888-7777',
    email: 'Ana@CafeLua.com',
    address: 'Rua das Flores, 10',
    notes: 'Prefers pickup',
  };

  it('creates, edits and searches customers by name, company, email or phone', async () => {
    const { client } = await registerWithCompany(app);
    const created = await client.post('/api/v1/customers', ana);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...ana, email: 'ana@cafelua.com', salesCount: 0 });
    await client.post('/api/v1/customers', { name: 'Bruno Lima' });

    const names = async (q: string) =>
      (
        (await client.get(`/api/v1/customers?q=${encodeURIComponent(q)}`)).body as {
          name: string;
        }[]
      ).map((c) => c.name);
    expect(await names('')).toEqual(['Ana Souza', 'Bruno Lima']);
    expect(await names('café')).toEqual(['Ana Souza']);
    expect(await names('98888')).toEqual(['Ana Souza']);
    expect(await names('cafelua.com')).toEqual(['Ana Souza']);

    const edited = await client.put(`/api/v1/customers/${created.body.id}`, {
      ...ana,
      phone: '',
    });
    expect(edited.body.phone).toBe('');
  });

  it('only needs a name, and validates the email when given', async () => {
    const { client } = await registerWithCompany(app);
    expect((await client.post('/api/v1/customers', { name: '' })).status).toBe(400);
    const bad = await client.post('/api/v1/customers', { name: 'Ana', email: 'ana@' });
    expect(bad.status).toBe(400);
    expect(bad.body.details[0].path).toBe('email');
  });

  it('archives with permission and stays isolated per company', async () => {
    const admin = await registerWithCompany(app);
    const employee = await addEmployee(app, admin.client, false);
    const other = await registerWithCompany(app, 'Other Lab');
    const customer = (await admin.client.post('/api/v1/customers', ana)).body;
    const url = `/api/v1/customers/${customer.id}/archive`;

    expect((await employee.client.get(`/api/v1/customers/${customer.id}`)).status).toBe(200);
    expect((await employee.client.post(url, { archived: true })).status).toBe(403);
    expect((await admin.client.post(url, { archived: true })).body.archived).toBe(true);
    expect((await admin.client.get('/api/v1/customers')).body).toEqual([]);
    expect((await admin.client.get('/api/v1/customers?archived=true')).body).toHaveLength(1);

    expect((await other.client.get(`/api/v1/customers/${customer.id}`)).status).toBe(404);
    expect((await other.client.post(url, { archived: false })).status).toBe(404);
  });
});
