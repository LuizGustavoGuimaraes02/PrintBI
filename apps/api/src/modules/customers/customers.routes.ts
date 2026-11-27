import {
  archiveSchema,
  customerFiltersSchema,
  customerInputSchema,
  objectIdSchema,
} from '@printbi/shared';
import { Router } from 'express';
import { Types } from 'mongoose';
import {
  authenticate,
  getCompanyAuth,
  requireCompany,
  requirePermission,
} from '../../core/auth/authenticate';
import { parseInput } from '../../core/http/validate';
import * as service from './customers.service';

export const customersRouter = Router();
customersRouter.use(authenticate, requireCompany);

const id = (value: unknown) => new Types.ObjectId(parseInput(objectIdSchema, value));

customersRouter.get('/', async (req, res) => {
  res.json(
    await service.listCustomers(
      getCompanyAuth(req).companyId,
      parseInput(customerFiltersSchema, req.query),
      getCompanyAuth(req).permissions.includes('finance:view'),
    ),
  );
});

customersRouter.post('/', async (req, res) => {
  const auth = getCompanyAuth(req);
  res
    .status(201)
    .json(
      await service.createCustomer(
        auth.companyId,
        auth.userId,
        parseInput(customerInputSchema, req.body),
      ),
    );
});

customersRouter.get('/:customerId', async (req, res) => {
  const auth = getCompanyAuth(req);
  res.json(
    await service.getCustomer(
      auth.companyId,
      id(req.params.customerId),
      auth.permissions.includes('finance:view'),
    ),
  );
});

customersRouter.put('/:customerId', async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(customerInputSchema, req.body);
  res.json(
    await service.updateCustomer(auth.companyId, auth.userId, id(req.params.customerId), input),
  );
});

customersRouter.post(
  '/:customerId/archive',
  requirePermission('records:archive'),
  async (req, res) => {
    const auth = getCompanyAuth(req);
    const { archived, reason } = parseInput(archiveSchema, req.body);
    res.json(
      await service.setCustomerArchived(
        auth.companyId,
        auth.userId,
        id(req.params.customerId),
        archived,
        reason,
      ),
    );
  },
);

customersRouter.delete('/:customerId', requirePermission('records:archive'), async (req, res) => {
  const auth = getCompanyAuth(req);
  await service.deleteCustomer(auth.companyId, auth.userId, id(req.params.customerId));
  res.status(204).end();
});
