import { Router } from 'express';
import { authenticate } from '../../core/auth/authenticate';
import { listFilamentProducts } from './filament-catalog.service';

export const filamentCatalogRouter = Router();

filamentCatalogRouter.get('/', authenticate, async (_req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json(await listFilamentProducts());
});
