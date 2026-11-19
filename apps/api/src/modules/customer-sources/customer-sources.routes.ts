import {
  customerSourceInputSchema,
  objectIdSchema,
  updateCustomerSourceSchema,
} from '@printbi/shared';
import { Router } from 'express';
import { Types } from 'mongoose';
import { authenticate, getCompanyAuth, requireCompany } from '../../core/auth/authenticate';
import { parseInput } from '../../core/http/validate';
import * as service from './customer-sources.service';

/** Members maintain sources while adding customers. */
export const customerSourcesRouter = Router();
customerSourcesRouter.use(authenticate, requireCompany);

customerSourcesRouter.get('/', async (req, res) => {
  res.json(await service.listSources(getCompanyAuth(req).companyId));
});

customerSourcesRouter.post('/', async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(customerSourceInputSchema, req.body);
  res.status(201).json(await service.createSource(auth.companyId, auth.userId, input));
});

customerSourcesRouter.patch('/:sourceId', async (req, res) => {
  const auth = getCompanyAuth(req);
  const sourceId = new Types.ObjectId(parseInput(objectIdSchema, req.params.sourceId));
  const input = parseInput(updateCustomerSourceSchema, req.body);
  res.json(await service.updateSource(auth.companyId, auth.userId, sourceId, input));
});

customerSourcesRouter.delete('/:sourceId', async (req, res) => {
  const auth = getCompanyAuth(req);
  const sourceId = new Types.ObjectId(parseInput(objectIdSchema, req.params.sourceId));
  await service.deleteSource(auth.companyId, auth.userId, sourceId);
  res.status(204).end();
});
