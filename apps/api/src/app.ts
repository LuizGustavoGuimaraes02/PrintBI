import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './core/http/error-handler';
import { logger } from './core/logger';
import { healthRouter } from './modules/health/health.routes';

export interface AppOptions {
  corsOrigins?: readonly string[];
}

export function createApp({ corsOrigins = env.CORS_ORIGINS }: AppOptions = {}): Express {
  const app = express();
  const allowedOrigins = new Set(corsOrigins);

  if (env.NODE_ENV === 'production') {
    // Behind one reverse proxy (Render/Railway): needed for secure cookies and per-IP rate limits.
    app.set('trust proxy', 1);
  }

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(
    pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false } }),
  );

  app.use('/health', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
