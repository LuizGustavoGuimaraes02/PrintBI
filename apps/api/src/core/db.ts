import mongoose from 'mongoose';
import { logger } from './logger';

mongoose.set('strictQuery', true);
// Never let a model build indexes implicitly in production; they are synced on startup instead.
mongoose.set('autoIndex', false);

export async function connectDatabase(uri: string): Promise<typeof mongoose> {
  const connection = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  await mongoose.syncIndexes();
  logger.info({ db: connection.connection.name }, 'MongoDB connected');
  return connection;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
