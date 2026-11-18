import { categoryInputSchema, objectIdSchema, updateCategorySchema } from '@printbi/shared';
import { Router } from 'express';
import { Types } from 'mongoose';
import { getCompanyAuth, requirePermission } from '../../core/auth/authenticate';
import { parseInput } from '../../core/http/validate';
import * as service from './categories.service';

/** Mounted under /companies/current/expense-categories. */
export const categoriesRouter = Router();

categoriesRouter.get('/', async (req, res) => {
  res.json(await service.listCategories(getCompanyAuth(req).companyId));
});

categoriesRouter.post('/', requirePermission('settings:manage'), async (req, res) => {
  const auth = getCompanyAuth(req);
  const { name } = parseInput(categoryInputSchema, req.body);
  res.status(201).json(await service.createCategory(auth.companyId, auth.userId, name));
});

categoriesRouter.patch('/:categoryId', requirePermission('settings:manage'), async (req, res) => {
  const auth = getCompanyAuth(req);
  const categoryId = new Types.ObjectId(parseInput(objectIdSchema, req.params.categoryId));
  const input = parseInput(updateCategorySchema, req.body);
  res.json(await service.updateCategory(auth.companyId, auth.userId, categoryId, input));
});
