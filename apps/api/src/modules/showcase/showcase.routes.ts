import { objectIdSchema, showcaseOrderSchema, showcaseSettingsSchema } from '@printbi/shared';
import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { getCompanyAuth, requirePermission } from '../../core/auth/authenticate';
import { publicRateLimit } from '../../core/auth/rate-limit';
import { parseInput } from '../../core/http/validate';
import * as products from '../products/products.service';
import * as publicService from './public.service';
import * as service from './showcase.service';

/** Mounted under /companies/current/showcase (members read, `showcase:manage` writes). */
export const showcaseSettingsRouter = Router();

const finance = (req: Parameters<typeof getCompanyAuth>[0]) =>
  getCompanyAuth(req).permissions.includes('finance:view');

showcaseSettingsRouter.get('/', async (req, res) => {
  res.json(await service.getShowcaseSettings(getCompanyAuth(req).companyId));
});

showcaseSettingsRouter.put('/', requirePermission('showcase:manage'), async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(showcaseSettingsSchema, req.body);
  res.json(await service.updateShowcaseSettings(auth.companyId, auth.userId, input));
});

showcaseSettingsRouter.get('/products', async (req, res) => {
  res.json(await products.listShowcaseProducts(getCompanyAuth(req).companyId, finance(req)));
});

showcaseSettingsRouter.put('/order', requirePermission('showcase:manage'), async (req, res) => {
  const auth = getCompanyAuth(req);
  const { productIds } = parseInput(showcaseOrderSchema, req.body);
  res.json(
    await products.setShowcaseOrder(
      auth.companyId,
      auth.userId,
      productIds.map((id) => new Types.ObjectId(parseInput(objectIdSchema, id))),
      finance(req),
    ),
  );
});

/**
 * Public pages, no account needed. Responses are the same for every visitor, so browsers and
 * proxies may keep them for a minute; Express adds an ETag so repeat visits get a 304.
 */
export const publicShowcaseRouter = Router();
publicShowcaseRouter.use(publicRateLimit);

/** Only successful pages are cached, so a showcase that was just published shows at once. */
const CACHE = 'public, max-age=60, stale-while-revalidate=300';

const slugParam = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/);

publicShowcaseRouter.get('/showcase/:slug', async (req, res) => {
  const view = await publicService.getPublicShowcase(parseInput(slugParam, req.params.slug));
  res.set('Cache-Control', CACHE).json(view);
});

publicShowcaseRouter.get('/showcase/:slug/:productSlug', async (req, res) => {
  const view = await publicService.getPublicProduct(
    parseInput(slugParam, req.params.slug),
    parseInput(slugParam, req.params.productSlug),
  );
  res.set('Cache-Control', CACHE).json(view);
});
