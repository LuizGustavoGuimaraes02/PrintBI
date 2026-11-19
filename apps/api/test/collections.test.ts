import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { addEmployee, registerWithCompany, type TestClient } from './client';
import { connectTestDatabase } from './memory-db';

const app = createApp();
let teardown: () => Promise<void>;

beforeAll(async () => {
  teardown = await connectTestDatabase();
});
afterAll(async () => teardown());

/** Stand-in for Cloudinary's API (lookup and delete); `upload` plays the browser upload. */
const cloud = new Map<string, { format: string; bytes: number }>();
const destroyed: string[] = [];
beforeEach(() => {
  cloud.clear();
  destroyed.length = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const lookup = /\/resources\/image\/upload\/(.+)$/.exec(url);
    if (lookup) {
      const publicId = decodeURIComponent(lookup[1] ?? '');
      const file = cloud.get(publicId);
      if (!file) return new Response('{}', { status: 404 });
      return Response.json({ public_id: publicId, version: 1, width: 1920, height: 640, ...file });
    }
    if (url.endsWith('/image/destroy')) {
      destroyed.push(new URLSearchParams(String(init?.body)).get('public_id') ?? '');
      return Response.json({ result: 'ok' });
    }
    throw new Error(`Unexpected request to ${url}`);
  });
});
afterEach(() => vi.restoreAllMocks());

const base = '/api/v1/companies/current/showcase';
let slugSequence = 0;

async function publishedShop() {
  const shop = await registerWithCompany(app);
  const slug = `shop-${Date.now().toString(36)}-${++slugSequence}`;
  await shop.client.put(base, {
    published: true,
    slug,
    title: '',
    description: '',
    language: 'pt-BR',
    whatsapp: '',
    messageTemplate: '',
  });
  const product = (
    await shop.client.post('/api/v1/products', {
      type: 'product',
      name: 'Estrela',
      labelIds: [],
      notes: 'Private supplier note',
    })
  ).body as { id: string };
  return { ...shop, slug, product };
}

const edit = (client: TestClient, key: string, extra: object = {}) =>
  client.put(`${base}/collections/${key}`, {
    active: true,
    name: { pt: '', en: '' },
    title: { pt: '', en: '' },
    intro: { pt: '', en: '' },
    alt: { pt: '', en: '' },
    ...extra,
  });

const showIn = (client: TestClient, productId: string, collections: string[]) =>
  client.put(`/api/v1/products/${productId}/showcase`, {
    visible: true,
    badge: 'ready',
    showPrice: false,
    featured: false,
    collections,
  });

describe('seasonal collections', () => {
  it('lists the four collections, all hidden, with default texts in both languages', async () => {
    const { client } = await registerWithCompany(app);
    const res = await client.get(`${base}/collections`);
    expect(res.body.map((c: { key: string }) => c.key)).toEqual([
      'valentines',
      'easter',
      'halloween',
      'christmas',
    ]);
    expect(res.body.every((c: { active: boolean }) => !c.active)).toBe(true);
    expect(res.body[3]).toMatchObject({
      slug: 'natal',
      name: { pt: 'Natal', en: 'Christmas' },
      productCount: 0,
    });
  });

  it('answers "not found" for a hidden page, and shows it once the admin turns it on', async () => {
    const { client, slug, product } = await publishedShop();
    await showIn(client, product.id, ['christmas']);
    const visitor = request(app);
    expect((await visitor.get(`/api/v1/public/showcase/${slug}/c/natal`)).status).toBe(404);
    expect((await visitor.get(`/api/v1/public/showcase/${slug}`)).body.collections).toEqual([]);

    const saved = await edit(client, 'christmas', { title: { pt: 'Natal 2026', en: '' } });
    expect(saved.body).toMatchObject({ active: true, productCount: 1 });
    expect(saved.body.title).toEqual({ pt: 'Natal 2026', en: 'Christmas off the printer' });

    const page = await visitor.get(`/api/v1/public/showcase/${slug}/c/natal`);
    expect(page.status).toBe(200);
    expect(page.body.collection).toMatchObject({ key: 'christmas', slug: 'natal' });
    expect(page.body.products.map((p: { name: string }) => p.name)).toEqual(['Estrela']);
    expect(page.body.preview).toBe(false);
    expect(JSON.stringify(page.body)).not.toMatch(/"id"|_id|Private supplier note|companyId/);

    const main = await visitor.get(`/api/v1/public/showcase/${slug}`);
    expect(main.body.collections.map((c: { key: string }) => c.key)).toEqual(['christmas']);
  });

  it('keeps products in a hidden collection on the main showcase', async () => {
    const { client, slug, product } = await publishedShop();
    await showIn(client, product.id, ['halloween']);
    const main = await request(app).get(`/api/v1/public/showcase/${slug}`);
    expect(main.body.products).toHaveLength(1);
  });

  it('lets the admin preview a hidden collection, and only the admin edit it', async () => {
    const { client } = await publishedShop();
    const employee = await addEmployee(app, client, true);
    const preview = await client.get(`${base}/collections/easter/preview`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ preview: true, collection: { key: 'easter' } });

    expect((await employee.client.get(`${base}/collections/easter/preview`)).status).toBe(403);
    expect((await edit(employee.client, 'easter')).status).toBe(403);
    expect((await employee.client.get(`${base}/collections`)).status).toBe(200);
    expect((await client.put(`${base}/collections/summer`, {})).status).toBe(400);
  });

  it('stores banners per language, replaces them and deletes the old file', async () => {
    const { client } = await publishedShop();
    const upload = async (slot: string, lang: string, format = 'jpg') => {
      const signed = await client.post('/api/v1/uploads/sign', {
        target: 'collection',
        key: 'christmas',
      });
      expect(signed.body.publicId).toContain('/collections/christmas/');
      cloud.set(signed.body.publicId, { format, bytes: 300_000 });
      return client.post(`${base}/collections/christmas/images`, {
        slot,
        lang,
        publicId: signed.body.publicId,
      });
    };
    const first = await upload('banner-desktop', 'pt');
    expect(first.body.banners.pt.desktop.urls.full).toContain('/collections/christmas/');
    expect(first.body.banners.en.desktop).toBeNull();

    await upload('banner-desktop', 'pt');
    expect(destroyed).toHaveLength(1);

    const english = await upload('banner-mobile', 'en');
    expect(english.body.banners.en.mobile).not.toBeNull();
    expect((await upload('header', 'pt', 'png')).status).toBe(400);

    const removed = await client.delete(
      `${base}/collections/christmas/images?slot=banner-mobile&lang=en`,
    );
    expect(removed.body.banners.en.mobile).toBeNull();
    expect(destroyed).toHaveLength(3);
  });

  it('lets only the admin sign collection uploads', async () => {
    const { client } = await registerWithCompany(app);
    const employee = await addEmployee(app, client, true);
    const res = await employee.client.post('/api/v1/uploads/sign', {
      target: 'collection',
      key: 'easter',
    });
    expect(res.status).toBe(403);
  });
});
