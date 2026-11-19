import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { createApp } from '../src/app';
import { folderKey } from '../src/core/media/uploads';
import { addEmployee, registerWithCompany, type TestClient } from './client';
import { connectTestDatabase } from './memory-db';

const app = createApp();
let teardown: () => Promise<void>;

beforeAll(async () => {
  teardown = await connectTestDatabase();
});
afterAll(async () => teardown());

/**
 * A stand-in for Cloudinary's HTTP API. `upload` plays the browser's direct upload; the API
 * then looks the file up and deletes it through fetch, which these tests intercept.
 */
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
      return Response.json({
        public_id: publicId,
        version: 1700000000,
        width: 1600,
        height: 1600,
        ...file,
      });
    }
    if (url.endsWith('/image/destroy')) {
      const publicId = new URLSearchParams(String(init?.body)).get('public_id') ?? '';
      destroyed.push(publicId);
      cloud.delete(publicId);
      return Response.json({ result: 'ok' });
    }
    throw new Error(`Unexpected request to ${url}`);
  });
});
afterEach(() => vi.restoreAllMocks());

const upload = (publicId: string, format = 'jpg', bytes = 200_000) =>
  cloud.set(publicId, { format, bytes });

const CAD = (amount: string) => ({ amount, currency: 'CAD' });

async function createProduct(client: TestClient, extra: object = {}) {
  const res = await client.post('/api/v1/products', {
    type: 'product',
    name: 'Dragon keychain',
    description: 'Articulated dragon',
    labelIds: [],
    price: CAD('15'),
    estimatedCost: CAD('3.40'),
    specs: { widthMm: 120, depthMm: 30, heightMm: 8, filamentGrams: '24.5' },
    notes: 'Secret supplier: PolyMaker 20% off',
    ...extra,
  });
  if (res.status !== 201) throw new Error(`product failed: ${JSON.stringify(res.body)}`);
  return res.body as { id: string; name: string };
}

/** Signs, "uploads" and registers one product photo. */
async function addPhoto(client: TestClient, productId: string, format = 'jpg') {
  const signed = await client.post('/api/v1/uploads/sign', { target: 'product', productId });
  upload(signed.body.publicId, format);
  return client.post(`/api/v1/products/${productId}/images`, { publicId: signed.body.publicId });
}

const showcase = (visible = true, extra: object = {}) => ({
  visible,
  badge: 'ready',
  showPrice: false,
  featured: false,
  ...extra,
});

const settings = (slug: string, extra: object = {}) => ({
  published: true,
  slug,
  title: 'Printed in Toronto',
  description: 'Keychains, vases and custom parts.',
  language: 'en',
  whatsapp: '+1 (416) 555-0100',
  messageTemplate: '',
  ...extra,
});

let slugSequence = 0;
const uniqueSlug = () => `layer-lab-${Date.now().toString(36)}-${++slugSequence}`;

describe('signed uploads', () => {
  it('signs uploads only inside the company folder, for its own products', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const product = await createProduct(client);

    expect((await client.get('/api/v1/uploads/config')).body).toEqual({ enabled: true });
    const key = (id: string) => folderKey(new Types.ObjectId(id));
    const signed = await client.post('/api/v1/uploads/sign', {
      target: 'product',
      productId: product.id,
    });
    expect(signed.status).toBe(200);
    expect(signed.body.publicId).toMatch(
      new RegExp(`^printbi/${key(companyId)}/products/${key(product.id)}/[0-9a-f]{24}$`),
    );
    expect(signed.body.fields).toMatchObject({
      api_key: 'test-key',
      public_id: signed.body.publicId,
      allowed_formats: 'jpg,png,webp',
    });
    expect(signed.body.fields.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(JSON.stringify(signed.body)).not.toContain('test-secret');

    const other = await registerWithCompany(app, 'Other shop');
    const foreign = await other.client.post('/api/v1/uploads/sign', {
      target: 'product',
      productId: product.id,
    });
    expect(foreign.status).toBe(404);
  });

  it('lets only an admin sign a logo upload', async () => {
    const { client } = await registerWithCompany(app);
    const employee = await addEmployee(app, client, true);
    expect((await employee.client.post('/api/v1/uploads/sign', { target: 'logo' })).status).toBe(
      403,
    );
    expect((await client.post('/api/v1/uploads/sign', { target: 'logo' })).status).toBe(200);
  });
});

describe('product photos', () => {
  it('registers a photo after checking the stored file, with resized URLs', async () => {
    const { client } = await registerWithCompany(app);
    const product = await createProduct(client);
    const res = await addPhoto(client, product.id);
    expect(res.status).toBe(201);
    expect(res.body.images).toHaveLength(1);
    expect(res.body.images[0].urls.card).toContain('/printbi-test/image/upload/c_fill');
    expect(res.body.images[0].urls.card).toContain('f_auto,q_auto');
  });

  it('refuses ids outside the folder, unfinished uploads, and wrong files (deleting them)', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const product = await createProduct(client);
    const other = await createProduct(client, { name: 'Vase' });
    const key = (id: string) => folderKey(new Types.ObjectId(id));

    const elsewhere = `printbi/${key(companyId)}/products/${key(other.id)}/abc`;
    upload(elsewhere);
    const outside = await client.post(`/api/v1/products/${product.id}/images`, {
      publicId: elsewhere,
    });
    expect(outside.status).toBe(400);

    const missing = await client.post(`/api/v1/products/${product.id}/images`, {
      publicId: `printbi/${key(companyId)}/products/${key(product.id)}/never-uploaded`,
    });
    expect(missing.status).toBe(404);

    const gif = await addPhoto(client, product.id, 'gif');
    expect(gif.status).toBe(400);
    expect(destroyed).toHaveLength(1);

    const signed = await client.post('/api/v1/uploads/sign', {
      target: 'product',
      productId: product.id,
    });
    upload(signed.body.publicId, 'jpg', 6 * 1024 * 1024);
    const big = await client.post(`/api/v1/products/${product.id}/images`, {
      publicId: signed.body.publicId,
    });
    expect(big.status).toBe(400);
    expect(big.body.message).toContain('5 MB');
    expect(destroyed).toContain(signed.body.publicId);
  });

  it('keeps at most 8 photos', async () => {
    const { client } = await registerWithCompany(app);
    const product = await createProduct(client);
    for (let i = 0; i < 8; i += 1) expect((await addPhoto(client, product.id)).status).toBe(201);
    const ninth = await addPhoto(client, product.id);
    expect(ninth.status).toBe(409);
    expect(destroyed).toHaveLength(1);
  });

  it('reorders photos with alt text, and deletes a removed photo on Cloudinary', async () => {
    const { client } = await registerWithCompany(app);
    const product = await createProduct(client);
    await addPhoto(client, product.id);
    const both = (await addPhoto(client, product.id)).body.images as { id: string }[];
    const [first, second] = both as [{ id: string }, { id: string }];

    const reordered = await client.put(`/api/v1/products/${product.id}/images`, {
      images: [
        { id: second.id, alt: 'Dragon on a desk' },
        { id: first.id, alt: '' },
      ],
    });
    expect(reordered.status).toBe(200);
    expect(reordered.body.images.map((i: { id: string }) => i.id)).toEqual([second.id, first.id]);
    expect(reordered.body.images[0].alt).toBe('Dragon on a desk');

    const partial = await client.put(`/api/v1/products/${product.id}/images`, {
      images: [{ id: second.id, alt: '' }],
    });
    expect(partial.status).toBe(409);

    const removed = await client.delete(`/api/v1/products/${product.id}/images/${first.id}`);
    expect(removed.body.images).toHaveLength(1);
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toContain(`/products/${folderKey(new Types.ObjectId(product.id))}/`);
  });
});

describe('showcase controls', () => {
  it('lets only an admin show or hide a product', async () => {
    const { client } = await registerWithCompany(app);
    const employee = await addEmployee(app, client, true);
    const product = await createProduct(client);

    const refused = await employee.client.put(
      `/api/v1/products/${product.id}/showcase`,
      showcase(),
    );
    expect(refused.status).toBe(403);
    const shown = await client.put(`/api/v1/products/${product.id}/showcase`, showcase());
    expect(shown.body.showcase).toMatchObject({
      visible: true,
      badge: 'ready',
      slug: 'dragon-keychain',
    });

    // An employee may still edit the product itself, without touching how it shows.
    const edited = await employee.client.put(`/api/v1/products/${product.id}`, {
      type: 'product',
      name: 'Dragon keychain XL',
      labelIds: [],
    });
    expect(edited.body.showcase.visible).toBe(true);
  });

  it('gives each shown product its own link, and refuses archived products', async () => {
    const { client } = await registerWithCompany(app);
    const a = await createProduct(client);
    const b = await createProduct(client);
    await client.put(`/api/v1/products/${a.id}/showcase`, showcase());
    const second = await client.put(`/api/v1/products/${b.id}/showcase`, showcase());
    expect(second.body.showcase.slug).toBe('dragon-keychain-2');
    expect(second.body.showcase.order).toBe(2);

    const c = await createProduct(client, { name: 'Old vase' });
    await client.post(`/api/v1/products/${c.id}/archive`, { archived: true });
    expect((await client.put(`/api/v1/products/${c.id}/showcase`, showcase())).status).toBe(409);
  });

  it('saves the showcase order', async () => {
    const { client } = await registerWithCompany(app);
    const a = await createProduct(client, { name: 'A' });
    const b = await createProduct(client, { name: 'B' });
    await client.put(`/api/v1/products/${a.id}/showcase`, showcase());
    await client.put(`/api/v1/products/${b.id}/showcase`, showcase());
    const res = await client.put('/api/v1/companies/current/showcase/order', {
      productIds: [b.id, a.id],
    });
    expect(res.body.map((p: { name: string }) => p.name)).toEqual(['B', 'A']);
  });
});

describe('showcase settings', () => {
  it('suggests a link from the business name and keeps links unique', async () => {
    const { client } = await registerWithCompany(app, 'Camada Três');
    const suggested = (await client.get('/api/v1/companies/current/showcase')).body;
    expect(suggested).toMatchObject({ published: false, slug: 'camada-tres' });

    const slug = uniqueSlug();
    const saved = await client.put('/api/v1/companies/current/showcase', settings(slug));
    expect(saved.body).toMatchObject({ published: true, slug, publicPath: `/s/${slug}` });

    const other = await registerWithCompany(app, 'Other shop');
    const taken = await other.client.put('/api/v1/companies/current/showcase', settings(slug));
    expect(taken.status).toBe(409);
    expect(taken.body.details).toEqual([{ path: 'slug', message: expect.any(String) }]);

    // A new business with the same name is offered a free link instead.
    const twin = await registerWithCompany(app, 'Camada Três');
    const first = await twin.client.put(
      '/api/v1/companies/current/showcase',
      settings('camada-tres'),
    );
    expect(first.status).toBe(200);
    const third = await registerWithCompany(app, 'Camada Três');
    expect((await third.client.get('/api/v1/companies/current/showcase')).body.slug).toBe(
      'camada-tres-2',
    );
    await third.client.put('/api/v1/companies/current/showcase', settings('camada-tres-2'));
    const fourth = await registerWithCompany(app, 'Camada Três');
    expect((await fourth.client.get('/api/v1/companies/current/showcase')).body.slug).toBe(
      'camada-tres-3',
    );
  });

  it('lets only an admin change the settings', async () => {
    const { client } = await registerWithCompany(app);
    const employee = await addEmployee(app, client, true);
    expect((await employee.client.get('/api/v1/companies/current/showcase')).status).toBe(200);
    const res = await employee.client.put(
      '/api/v1/companies/current/showcase',
      settings(uniqueSlug()),
    );
    expect(res.status).toBe(403);
  });

  it('replaces the logo and deletes the old file', async () => {
    const { client, companyId } = await registerWithCompany(app);
    const set = async () => {
      const signed = await client.post('/api/v1/uploads/sign', { target: 'logo' });
      expect(
        signed.body.publicId.startsWith(
          `printbi/${folderKey(new Types.ObjectId(companyId))}/logo/`,
        ),
      ).toBe(true);
      upload(signed.body.publicId, 'svg', 20_000);
      return client.post('/api/v1/companies/current/logo', { publicId: signed.body.publicId });
    };
    const first = await set();
    expect(first.body.logo.urls.thumb).toContain('/logo/');
    await set();
    expect(destroyed).toHaveLength(1);
    const removed = await client.delete('/api/v1/companies/current/logo');
    expect(removed.body.logo).toBeNull();
    expect(destroyed).toHaveLength(2);
  });
});

describe('public showcase', () => {
  async function publishedShop() {
    const shop = await registerWithCompany(app);
    const slug = uniqueSlug();
    await shop.client.put('/api/v1/companies/current/showcase', settings(slug));
    const keychain = await shop.client.post('/api/v1/labels', { name: 'Keychain' });
    const retired = await shop.client.post('/api/v1/labels', { name: 'Retired' });
    await shop.client.patch(`/api/v1/labels/${retired.body.id}`, { archived: true });
    const product = await createProduct(shop.client, { labelIds: [keychain.body.id] });
    await addPhoto(shop.client, product.id);
    await shop.client.put(`/api/v1/products/${product.id}/showcase`, showcase());
    return { ...shop, slug, product };
  }

  it('answers "not found" until the showcase is published', async () => {
    const { client } = await registerWithCompany(app);
    const slug = uniqueSlug();
    await client.put('/api/v1/companies/current/showcase', settings(slug, { published: false }));
    expect((await client.get(`/api/v1/public/showcase/${slug}`)).status).toBe(404);
  });

  it('shows only allowlisted fields: no cost, notes, sales data or ids', async () => {
    const { slug, product, companyId } = await publishedShop();
    const visitor = (await import('supertest')).default(app);
    const res = await visitor.get(`/api/v1/public/showcase/${slug}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('public');
    expect(res.headers.etag).toBeDefined();

    expect(Object.keys(res.body).sort()).toEqual(['business', 'collections', 'labels', 'products']);
    expect(Object.keys(res.body.business).sort()).toEqual(
      [
        'description',
        'language',
        'logo',
        'messageTemplate',
        'name',
        'slug',
        'social',
        'title',
        'website',
        'whatsapp',
      ].sort(),
    );
    const [card] = res.body.products;
    expect(Object.keys(card).sort()).toEqual(
      [
        'badge',
        'cover',
        'customUnit',
        'description',
        'featured',
        'imageCount',
        'labels',
        'name',
        'price',
        'saleUnit',
        'slug',
        'specs',
        'type',
      ].sort(),
    );
    expect(Object.keys(card.cover).sort()).toEqual(['alt', 'height', 'urls', 'width']);
    expect(card.price).toBeNull();
    expect(res.body.labels).toEqual([{ name: 'Keychain', color: '#E2F1F3' }]);

    const text = JSON.stringify(res.body);
    for (const secret of ['estimatedCost', 'notes', 'Secret supplier', product.id, companyId]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/"id"|"_id"|companyId|createdBy|archived/);

    const detail = await visitor.get(`/api/v1/public/showcase/${slug}/dragon-keychain`);
    expect(detail.status).toBe(200);
    expect(detail.body.images).toHaveLength(1);
    expect(JSON.stringify(detail.body)).not.toMatch(/"id"|_id|estimatedCost|Secret supplier/);
  });

  it('shows the price only when chosen, and hides hidden products', async () => {
    const { client, slug, product } = await publishedShop();
    const visitor = (await import('supertest')).default(app);
    await client.put(
      `/api/v1/products/${product.id}/showcase`,
      showcase(true, { showPrice: true }),
    );
    const priced = await visitor.get(`/api/v1/public/showcase/${slug}`);
    expect(priced.body.products[0].price).toEqual({ amount: 15_000_000, currency: 'CAD' });

    await client.put(`/api/v1/products/${product.id}/showcase`, showcase(false));
    expect((await visitor.get(`/api/v1/public/showcase/${slug}`)).body.products).toEqual([]);
    expect((await visitor.get(`/api/v1/public/showcase/${slug}/dragon-keychain`)).status).toBe(404);
  });

  it('hides archived products even if they were visible', async () => {
    const { client, slug, product } = await publishedShop();
    await client.post(`/api/v1/products/${product.id}/archive`, { archived: true });
    const visitor = (await import('supertest')).default(app);
    expect((await visitor.get(`/api/v1/public/showcase/${slug}`)).body.products).toEqual([]);
  });
});
