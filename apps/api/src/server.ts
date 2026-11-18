import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './core/db';
import { logger } from './core/logger';

async function main(): Promise<void> {
  await connectDatabase(env.MONGO_URI);
  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`);
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      disconnectDatabase()
        .catch((error: unknown) => logger.error({ err: error }, 'Error closing MongoDB'))
        .finally(() => process.exit(0));
    });
    // Do not hang forever on open connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start the API');
  process.exit(1);
});
