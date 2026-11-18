import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { inject } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../src/core/db';

/**
 * Connects Mongoose to a fresh, uniquely named database on the shared test
 * replica set. Returns a teardown that drops it and disconnects.
 */
export async function connectTestDatabase(): Promise<() => Promise<void>> {
  const uri = new URL(inject('mongoUri'));
  uri.pathname = `/printbi-test-${randomUUID()}`;
  await connectDatabase(uri.toString());
  return async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  };
}
