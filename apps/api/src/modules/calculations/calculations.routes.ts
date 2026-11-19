import { calculationFiltersSchema, calculationSaveSchema, objectIdSchema } from '@printbi/shared';
import { Router } from 'express';
import { Types } from 'mongoose';
import {
  authenticate,
  getCompanyAuth,
  requireCompany,
  requirePermission,
} from '../../core/auth/authenticate';
import { parseInput } from '../../core/http/validate';
import * as service from './calculations.service';

/**
 * Saved calculations. The calculator is all about costs, so every route needs financial
 * access (the admin, or an employee the admin gave it to).
 */
export const calculationsRouter = Router();
calculationsRouter.use(authenticate, requireCompany, requirePermission('finance:view'));

const id = (value: unknown) => new Types.ObjectId(parseInput(objectIdSchema, value));

calculationsRouter.get('/', async (req, res) => {
  const auth = getCompanyAuth(req);
  res.json(
    await service.listCalculations(auth.companyId, parseInput(calculationFiltersSchema, req.query)),
  );
});

calculationsRouter.post('/', async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(calculationSaveSchema, req.body);
  res.status(201).json(await service.createCalculation(auth.companyId, auth.userId, input));
});

calculationsRouter.get('/:calculationId', async (req, res) => {
  const auth = getCompanyAuth(req);
  res.json(await service.getCalculation(auth.companyId, id(req.params.calculationId)));
});

calculationsRouter.put('/:calculationId', async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(calculationSaveSchema, req.body);
  res.json(
    await service.updateCalculation(
      auth.companyId,
      auth.userId,
      id(req.params.calculationId),
      input,
    ),
  );
});

calculationsRouter.delete('/:calculationId', async (req, res) => {
  const auth = getCompanyAuth(req);
  await service.deleteCalculation(auth.companyId, auth.userId, id(req.params.calculationId));
  res.status(204).end();
});
