import { labelInputSchema, objectIdSchema, updateLabelSchema } from '@printbi/shared';
import { Router } from 'express';
import { Types } from 'mongoose';
import { authenticate, getCompanyAuth, requireCompany } from '../../core/auth/authenticate';
import { parseInput } from '../../core/http/validate';
import * as service from './labels.service';

/** Members maintain labels together with the catalog. */
export const labelsRouter = Router();
labelsRouter.use(authenticate, requireCompany);

labelsRouter.get('/', async (req, res) => {
  res.json(await service.listLabels(getCompanyAuth(req).companyId));
});

labelsRouter.post('/', async (req, res) => {
  const auth = getCompanyAuth(req);
  res
    .status(201)
    .json(
      await service.createLabel(
        auth.companyId,
        auth.userId,
        parseInput(labelInputSchema, req.body),
      ),
    );
});

labelsRouter.patch('/:labelId', async (req, res) => {
  const auth = getCompanyAuth(req);
  const labelId = new Types.ObjectId(parseInput(objectIdSchema, req.params.labelId));
  res.json(
    await service.updateLabel(
      auth.companyId,
      auth.userId,
      labelId,
      parseInput(updateLabelSchema, req.body),
    ),
  );
});
