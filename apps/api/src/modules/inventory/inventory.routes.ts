import {
  adjustLotSchema,
  consumptionSchema,
  createItemSchema,
  ITEM_KINDS,
  itemInputSchema,
  lotInputSchema,
  objectIdSchema,
  purchaseSchema,
  recordLotExpensesSchema,
  reverseMovementSchema,
  updateLotSchema,
} from '@printbi/shared';
import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  authenticate,
  getCompanyAuth,
  requireCompany,
  requirePermission,
} from '../../core/auth/authenticate';
import { idempotencyKey } from '../../core/http/idempotency';
import { parseInput } from '../../core/http/validate';
import * as service from './inventory.service';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate, requireCompany);

function actor(req: Request): service.Actor {
  const auth = getCompanyAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    canSeeFinance: auth.permissions.includes('finance:view'),
    canManageFinance: auth.permissions.includes('finance:manage'),
  };
}

const id = (value: unknown) => new Types.ObjectId(parseInput(objectIdSchema, value));

/** 201 for new work, 200 with a header when an idempotent request was replayed. */
function created(res: Response, replayed: boolean, body: unknown) {
  if (replayed) res.set('Idempotent-Replayed', 'true');
  res.status(replayed ? 200 : 201).json(body);
}

const listFilters = z.object({
  kind: z.enum(ITEM_KINDS).optional(),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  stock: z.enum(['low', 'out']).optional(),
  q: z.string().trim().max(100).optional(),
});

inventoryRouter.get('/summary', async (req, res) => {
  res.json(await service.inventorySummary(actor(req)));
});

inventoryRouter.get('/items', async (req, res) => {
  res.json(await service.listItems(actor(req), parseInput(listFilters, req.query)));
});

inventoryRouter.post('/items', async (req, res) => {
  const input = parseInput(createItemSchema, req.body);
  // The key is only needed when a first lot moves stock.
  const key = input.firstLot ? idempotencyKey(req) : '';
  const { item, replayed } = await service.createItem(actor(req), input, key);
  created(res, replayed, item);
});

inventoryRouter.get('/items/:itemId', async (req, res) => {
  res.json(await service.getItem(actor(req), id(req.params.itemId)));
});

inventoryRouter.put('/items/:itemId', async (req, res) => {
  res.json(
    await service.updateItem(
      actor(req),
      id(req.params.itemId),
      parseInput(itemInputSchema, req.body),
    ),
  );
});

const archiveSchema = z.object({
  archived: z.boolean(),
  reason: z.string().trim().max(300).default(''),
});

inventoryRouter.post(
  '/items/:itemId/archive',
  requirePermission('records:archive'),
  async (req, res) => {
    const { archived, reason } = parseInput(archiveSchema, req.body);
    res.json(await service.setItemArchived(actor(req), id(req.params.itemId), archived, reason));
  },
);

inventoryRouter.get('/items/:itemId/movements', async (req, res) => {
  res.json(await service.listMovements(actor(req), id(req.params.itemId)));
});

inventoryRouter.post('/items/:itemId/lots', async (req, res) => {
  const lot = parseInput(lotInputSchema, req.body);
  const { item, replayed } = await service.addLot(
    actor(req),
    id(req.params.itemId),
    lot,
    idempotencyKey(req),
  );
  created(res, replayed, item);
});

inventoryRouter.patch('/items/:itemId/lots/:lotId', async (req, res) => {
  const input = parseInput(updateLotSchema, req.body);
  res.json(await service.updateLot(actor(req), id(req.params.itemId), id(req.params.lotId), input));
});

inventoryRouter.post('/items/:itemId/lots/:lotId/adjust', async (req, res) => {
  const input = parseInput(adjustLotSchema, req.body);
  const { item, replayed } = await service.adjustLot(
    actor(req),
    id(req.params.itemId),
    id(req.params.lotId),
    input,
    idempotencyKey(req),
  );
  created(res, replayed, item);
});

inventoryRouter.post('/consumptions', async (req, res) => {
  const input = parseInput(consumptionSchema, req.body);
  const { movements, replayed } = await service.recordConsumption(
    actor(req),
    input,
    idempotencyKey(req),
  );
  created(res, replayed, movements);
});

inventoryRouter.post('/movements/:movementId/reverse', async (req, res) => {
  const { reason } = parseInput(reverseMovementSchema, req.body);
  const { item, replayed } = await service.reverseMovement(
    actor(req),
    id(req.params.movementId),
    reason,
    idempotencyKey(req),
  );
  created(res, replayed, item);
});

/** Priced rolls that are not in Costs & Expenses yet. */
inventoryRouter.get('/unrecorded-lots', requirePermission('finance:manage'), async (req, res) => {
  res.json(await service.listUnrecordedLots(actor(req)));
});

inventoryRouter.post(
  '/unrecorded-lots/expenses',
  requirePermission('finance:manage'),
  async (req, res) => {
    const input = parseInput(recordLotExpensesSchema, req.body);
    res.status(201).json(await service.recordLotExpenses(actor(req), input));
  },
);

inventoryRouter.post('/purchases', async (req, res) => {
  const input = parseInput(purchaseSchema, req.body);
  const { items, replayed } = await service.recordPurchase(actor(req), input, idempotencyKey(req));
  created(res, replayed, items);
});

/** Deleting fixes a mistake; `expenses=delete` also removes expenses that paid only for it. */
const deleteQuery = z.object({
  expenses: z.enum(['delete', 'keep']).default('keep'),
  lotId: objectIdSchema.optional(),
});
const deleting = requirePermission('records:archive');

inventoryRouter.get('/items/:itemId/delete-preview', deleting, async (req, res) => {
  const { lotId } = parseInput(deleteQuery, req.query);
  res.json(
    await service.stockDeletePreview(
      actor(req),
      id(req.params.itemId),
      lotId ? new Types.ObjectId(lotId) : null,
    ),
  );
});

inventoryRouter.delete('/items/:itemId', deleting, async (req, res) => {
  const { expenses } = parseInput(deleteQuery, req.query);
  await service.deleteStock(actor(req), id(req.params.itemId), null, expenses === 'delete');
  res.status(204).end();
});

inventoryRouter.delete('/items/:itemId/lots/:lotId', deleting, async (req, res) => {
  const { expenses } = parseInput(deleteQuery, req.query);
  res.json(
    await service.deleteStock(
      actor(req),
      id(req.params.itemId),
      id(req.params.lotId),
      expenses === 'delete',
    ),
  );
});
