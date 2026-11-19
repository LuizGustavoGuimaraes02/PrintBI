import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { IDEMPOTENCY_HEADER } from '@printbi/shared';
import { CSRF_HEADER } from './core/auth/cookies';
import { csrfProtection } from './core/auth/csrf';
import { apiRateLimit } from './core/auth/rate-limit';
import { errorHandler, notFoundHandler } from './core/http/error-handler';
import { logger } from './core/logger';
import { authRouter } from './modules/auth/auth.routes';
import { calculationsRouter } from './modules/calculations/calculations.routes';
import { companiesRouter } from './modules/companies/companies.routes';
import { healthRouter } from './modules/health/health.routes';
import { customerSourcesRouter } from './modules/customer-sources/customer-sources.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { expensesRouter } from './modules/expenses/expenses.routes';
import { filamentCatalogRouter } from './modules/filament-catalog/filament-catalog.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { invitesRouter } from './modules/invites/invites.routes';
import { labelsRouter } from './modules/labels/labels.routes';
import { productsRouter } from './modules/products/products.routes';
import { printerCatalogRouter } from './modules/printer-catalog/printer-catalog.routes';
import { publicShowcaseRouter } from './modules/showcase/showcase.routes';
import { uploadsRouter } from './modules/uploads/uploads.routes';

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
      allowedHeaders: ['Content-Type', CSRF_HEADER, IDEMPOTENCY_HEADER],
      exposedHeaders: ['Idempotent-Replayed'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false } }),
  );

  app.use('/health', healthRouter);

  // Public showcase: no session, its own rate limit, and safe to cache.
  app.use('/api/v1/public', publicShowcaseRouter);

  const api = express.Router();
  api.use(apiRateLimit, csrfProtection);
  api.use('/auth', authRouter);
  api.use('/companies', companiesRouter);
  api.use('/invites', invitesRouter);
  api.use('/printer-models', printerCatalogRouter);
  api.use('/filament-products', filamentCatalogRouter);
  api.use('/inventory', inventoryRouter);
  api.use('/expenses', expensesRouter);
  api.use('/labels', labelsRouter);
  api.use('/products', productsRouter);
  api.use('/customers', customersRouter);
  api.use('/customer-sources', customerSourcesRouter);
  api.use('/uploads', uploadsRouter);
  api.use('/calculations', calculationsRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
