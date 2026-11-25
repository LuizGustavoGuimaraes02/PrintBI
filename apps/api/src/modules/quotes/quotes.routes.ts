import {
  objectIdSchema,
  quoteActionSchema,
  quoteFiltersSchema,
  quoteInputSchema,
} from '@printbi/shared';
import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import {
  authenticate,
  getCompanyAuth,
  requireCompany,
  requirePermission,
} from '../../core/auth/authenticate';
import { parseInput } from '../../core/http/validate';
import * as service from './quotes.service';

/** Members prepare quotes; cost breakdowns inside them need financial access. */
export const quotesRouter = Router();
quotesRouter.use(authenticate, requireCompany);

function actor(req: Request): service.QuoteActor {
  const auth = getCompanyAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    finance: auth.permissions.includes('finance:view'),
  };
}
const id = (value: unknown) => new Types.ObjectId(parseInput(objectIdSchema, value));

quotesRouter.get('/', async (req, res) => {
  res.json(await service.listQuotes(actor(req), parseInput(quoteFiltersSchema, req.query)));
});

quotesRouter.post('/', async (req, res) => {
  res
    .status(201)
    .json(await service.createQuote(actor(req), parseInput(quoteInputSchema, req.body)));
});

quotesRouter.get('/:quoteId', async (req, res) => {
  res.json(await service.getQuote(actor(req), id(req.params.quoteId)));
});

quotesRouter.put('/:quoteId', async (req, res) => {
  res.json(
    await service.updateQuote(
      actor(req),
      id(req.params.quoteId),
      parseInput(quoteInputSchema, req.body),
    ),
  );
});

quotesRouter.post('/:quoteId/actions', async (req, res) => {
  const { action, note } = parseInput(quoteActionSchema, req.body);
  res.json(await service.applyQuoteAction(actor(req), id(req.params.quoteId), action, note));
});

quotesRouter.delete('/:quoteId', requirePermission('records:archive'), async (req, res) => {
  await service.deleteQuote(actor(req), id(req.params.quoteId));
  res.status(204).end();
});
