import { Router } from 'express';
import { authenticate } from '../../core/auth/authenticate';
import { listPrinterModels } from './printer-catalog.service';

export const printerCatalogRouter = Router();

printerCatalogRouter.get('/', authenticate, async (_req, res) => {
  // Reference data that changes only with a new catalog build: let the browser keep it.
  res.set('Cache-Control', 'private, max-age=3600');
  res.json(await listPrinterModels());
});
