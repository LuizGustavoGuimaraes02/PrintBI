import {
  cancelExpenseSchema,
  expenseFiltersSchema,
  expenseInputSchema,
  objectIdSchema,
  paymentInputSchema,
  updateExpenseSchema,
} from '@printbi/shared';
import { Router } from 'express';
import { Types } from 'mongoose';
import {
  authenticate,
  getCompanyAuth,
  requireCompany,
  requirePermission,
} from '../../core/auth/authenticate';
import { idempotencyKey } from '../../core/http/idempotency';
import { parseInput } from '../../core/http/validate';
import { getSettings } from '../settings/settings.service';
import * as service from './expenses.service';

/** Every expense route needs financial access: reading `finance:view`, writing `finance:manage`. */
export const expensesRouter = Router();
expensesRouter.use(authenticate, requireCompany, requirePermission('finance:view'));

const id = (value: unknown) => new Types.ObjectId(parseInput(objectIdSchema, value));
const manage = requirePermission('finance:manage');

expensesRouter.get('/', async (req, res) => {
  const auth = getCompanyAuth(req);
  res.json(await service.listExpenses(auth.companyId, parseInput(expenseFiltersSchema, req.query)));
});

expensesRouter.get('/summary', async (req, res) => {
  const auth = getCompanyAuth(req);
  const { from, to } = parseInput(expenseFiltersSchema.pick({ from: true, to: true }), req.query);
  const settings = await getSettings(auth.companyId);
  res.json(
    await service.expenseSummary(auth.companyId, from, to, settings.currency.defaultCurrency),
  );
});

expensesRouter.post('/', manage, async (req, res) => {
  const auth = getCompanyAuth(req);
  const expenseId = await service.createExpense(
    auth.companyId,
    auth.userId,
    parseInput(expenseInputSchema, req.body),
  );
  res.status(201).json(await service.getExpense(auth.companyId, expenseId));
});

expensesRouter.get('/:expenseId', async (req, res) => {
  res.json(await service.getExpense(getCompanyAuth(req).companyId, id(req.params.expenseId)));
});

expensesRouter.patch('/:expenseId', manage, async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(updateExpenseSchema, req.body);
  res.json(
    await service.updateExpense(auth.companyId, auth.userId, id(req.params.expenseId), input),
  );
});

expensesRouter.post('/:expenseId/payments', manage, async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(paymentInputSchema, req.body);
  res
    .status(201)
    .json(
      await service.addPayment(
        auth.companyId,
        auth.userId,
        id(req.params.expenseId),
        input,
        idempotencyKey(req),
      ),
    );
});

expensesRouter.delete('/:expenseId/payments/:paymentId', manage, async (req, res) => {
  const auth = getCompanyAuth(req);
  res.json(
    await service.removePayment(
      auth.companyId,
      auth.userId,
      id(req.params.expenseId),
      id(req.params.paymentId),
    ),
  );
});

expensesRouter.post(
  '/:expenseId/cancel',
  manage,
  requirePermission('records:archive'),
  async (req, res) => {
    const auth = getCompanyAuth(req);
    const { reason } = parseInput(cancelExpenseSchema, req.body);
    res.json(
      await service.cancelExpense(auth.companyId, auth.userId, id(req.params.expenseId), reason),
    );
  },
);

expensesRouter.delete(
  '/:expenseId',
  manage,
  requirePermission('records:archive'),
  async (req, res) => {
    const auth = getCompanyAuth(req);
    await service.deleteExpense(auth.companyId, auth.userId, id(req.params.expenseId));
    res.status(204).end();
  },
);
