import { Router } from 'express';
import { isDatabaseReady } from '../../core/db';

export const healthRouter = Router();

/** Liveness: the process is up and answering. */
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

/** Readiness: dependencies are reachable, so the instance can take traffic. */
healthRouter.get('/ready', (_req, res) => {
  const database = isDatabaseReady();
  res
    .status(database ? 200 : 503)
    .json({ status: database ? 'ok' : 'unavailable', database: database ? 'up' : 'down' });
});
