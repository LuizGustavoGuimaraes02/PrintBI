import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import catalog from '../data/printer-models.json' with { type: 'json' };
import { createApp } from '../src/app';
import { syncPrinterCatalog } from '../src/modules/printer-catalog/printer-catalog.service';
import { PrinterModelModel } from '../src/modules/printer-catalog/printer-model.model';
import { registerWithCompany, TestClient } from './client';
import { connectTestDatabase } from './memory-db';

const app = createApp();
let teardown: () => Promise<void>;

beforeAll(async () => {
  teardown = await connectTestDatabase();
});
afterAll(async () => teardown());

describe('printer catalog', () => {
  it('is loaded into the database when the API connects', async () => {
    expect(await PrinterModelModel.countDocuments()).toBe(catalog.printers.length);
  });

  it('syncing again changes nothing', async () => {
    const before = await PrinterModelModel.find().lean();
    await syncPrinterCatalog();
    expect(await PrinterModelModel.find().lean()).toEqual(before);
  });

  it('is served to signed-in users, sorted, with only display fields', async () => {
    const { client } = await registerWithCompany(app);
    const res = await client.get('/api/v1/printer-models');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age');
    expect(res.body).toHaveLength(catalog.printers.length);
    const adventurer = res.body.find(
      (m: { fullName: string }) => m.fullName === 'FlashForge Adventurer 5M',
    );
    expect(adventurer).toMatchObject({ brand: 'FlashForge', ratedPowerW: expect.any(Number) });
    expect(adventurer).not.toHaveProperty('slug');
    expect(adventurer).not.toHaveProperty('catalogCommit');
  });

  it('requires a session', async () => {
    expect((await new TestClient(app).get('/api/v1/printer-models')).status).toBe(401);
  });
});

describe('printers linked to a catalog model', () => {
  it('stores the model and returns it for the spec sheet', async () => {
    const { client } = await registerWithCompany(app);
    const [model] = (await client.get('/api/v1/printer-models')).body;
    const created = await client.post('/api/v1/companies/current/printers', {
      modelId: model.id,
      name: model.fullName,
      brand: model.brand,
      model: model.model,
    });
    expect(created.status).toBe(201);
    expect(created.body.modelId).toBe(model.id);
  });

  it('still allows a printer typed by hand (not in the catalog)', async () => {
    const { client } = await registerWithCompany(app);
    const created = await client.post('/api/v1/companies/current/printers', {
      name: 'My custom Voron build',
    });
    expect(created.status).toBe(201);
    expect(created.body.modelId).toBeNull();
  });

  it('refuses an unknown model id', async () => {
    const { client } = await registerWithCompany(app);
    const res = await client.post('/api/v1/companies/current/printers', {
      modelId: '0123456789abcdef01234567',
      name: 'Ghost',
    });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ path: 'modelId', message: 'Unknown printer model' }]);
  });
});

describe('filament catalog', () => {
  it('is served to signed-in users with only display fields', async () => {
    const { client } = await registerWithCompany(app);
    const res = await client.get('/api/v1/filament-products');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(400);
    const basic = res.body.find(
      (f: { brand: string; product: string }) =>
        f.brand === 'Bambu Lab' && f.product === 'PETG Basic',
    );
    expect(basic).toMatchObject({ type: 'PETG', nozzleTempMin: 230, densityGcm3: 1.27 });
    expect(basic).not.toHaveProperty('slug');
  });
});
