import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { connectTestDatabase } from './memory-db';

let stopDatabase: (() => Promise<void>) | undefined;

beforeAll(async () => {
  stopDatabase = await connectTestDatabase();
});

afterAll(async () => {
  await stopDatabase?.();
});

describe('database', () => {
  it('reports ready once connected', async () => {
    const res = await request(createApp()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('supports multi-document transactions (replica set)', async () => {
    const collection = mongoose.connection.collection('tx_probe');
    await collection.insertOne({ value: 0 });

    await mongoose.connection.transaction(async (session) => {
      await collection.updateOne({}, { $inc: { value: 1 } }, { session });
    });
    expect((await collection.findOne())?.value).toBe(1);

    await expect(
      mongoose.connection.transaction(async (session) => {
        await collection.updateOne({}, { $inc: { value: 1 } }, { session });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await collection.findOne())?.value).toBe(1);
  });
});
