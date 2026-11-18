import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

/**
 * One in-memory replica set (transactions need one) for the whole test run.
 * Each test file gets its own database on it, so files stay isolated and the
 * mongod start-up cost is paid once.
 */
export default async function setup(project: TestProject) {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    // mongod start-up can be very slow on some Windows machines.
    instanceOpts: [{ launchTimeout: 180_000 }],
  });
  project.provide('mongoUri', replSet.getUri());
  return async () => {
    await replSet.stop();
  };
}
