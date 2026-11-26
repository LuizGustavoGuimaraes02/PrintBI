import {
  objectIdSchema,
  orderConsumptionSchema,
  orderFiltersSchema,
  orderHoldSchema,
  orderPictureSchema,
  orderInputSchema,
  orderMoveSchema,
  orderPaymentSchema,
  orderReminderSchema,
} from '@printbi/shared';
import { Router, type Request } from 'express';
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
import * as service from './orders.service';

/**
 * Every member creates, edits and moves orders and records their stock use. Prices and costs
 * need financial access; cancelling and deleting need the archive permission.
 */
export const ordersRouter = Router();
ordersRouter.use(authenticate, requireCompany);

function actor(req: Request): service.OrderActor {
  const auth = getCompanyAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    finance: auth.permissions.includes('finance:view'),
    manageFinance: auth.permissions.includes('finance:manage'),
    archive: auth.permissions.includes('records:archive'),
  };
}
const id = (value: unknown) => new Types.ObjectId(parseInput(objectIdSchema, value));
const todayQuery = z.object({ today: orderFiltersSchema.shape.today });
const today = (req: Request) => parseInput(todayQuery, req.query).today;

ordersRouter.get('/', async (req, res) => {
  res.json(await service.listOrders(actor(req), parseInput(orderFiltersSchema, req.query)));
});

ordersRouter.post('/', async (req, res) => {
  res
    .status(201)
    .json(await service.createOrder(actor(req), parseInput(orderInputSchema, req.body)));
});

ordersRouter.get('/from-quote/:quoteId', async (req, res) => {
  res.json(await service.draftFromQuote(actor(req), id(req.params.quoteId)));
});

ordersRouter.get('/:orderId', async (req, res) => {
  res.json(await service.getOrder(actor(req), id(req.params.orderId), today(req)));
});

ordersRouter.put('/:orderId', async (req, res) => {
  res.json(
    await service.updateOrder(
      actor(req),
      id(req.params.orderId),
      parseInput(orderInputSchema, req.body),
    ),
  );
});

ordersRouter.post('/:orderId/move', async (req, res) => {
  res.json(
    await service.moveOrder(
      actor(req),
      id(req.params.orderId),
      parseInput(orderMoveSchema, req.body),
      today(req),
    ),
  );
});

ordersRouter.patch('/:orderId/payment', requirePermission('finance:manage'), async (req, res) => {
  const { paymentStatus } = parseInput(orderPaymentSchema, req.body);
  res.json(await service.setPayment(actor(req), id(req.params.orderId), paymentStatus));
});

ordersRouter.patch('/:orderId/hold', async (req, res) => {
  res.json(
    await service.setHold(
      actor(req),
      id(req.params.orderId),
      parseInput(orderHoldSchema, req.body),
    ),
  );
});

ordersRouter.get('/:orderId/picture', async (req, res) => {
  const picture = await service.getPicture(actor(req), id(req.params.orderId));
  // The URL carries a version, so the browser may keep it; it is private to the signed-in member.
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.type(picture.contentType).send(picture.data);
});

ordersRouter.put('/:orderId/picture', async (req, res) => {
  res.json(
    await service.setPicture(
      actor(req),
      id(req.params.orderId),
      parseInput(orderPictureSchema, req.body),
    ),
  );
});

ordersRouter.delete('/:orderId/picture', async (req, res) => {
  res.json(await service.removePicture(actor(req), id(req.params.orderId)));
});

ordersRouter.post('/:orderId/reminder', async (req, res) => {
  res.json(
    await service.remind(
      actor(req),
      id(req.params.orderId),
      parseInput(orderReminderSchema, req.body),
    ),
  );
});

ordersRouter.get('/:orderId/movements', async (req, res) => {
  res.json(await service.listOrderMovements(actor(req), id(req.params.orderId)));
});

ordersRouter.post('/:orderId/consumptions', async (req, res) => {
  const { movements, replayed } = await service.recordOrderUsage(
    actor(req),
    id(req.params.orderId),
    parseInput(orderConsumptionSchema, req.body),
    idempotencyKey(req),
  );
  if (replayed) res.set('Idempotent-Replayed', 'true');
  res.status(replayed ? 200 : 201).json(movements);
});

ordersRouter.delete('/:orderId', requirePermission('records:archive'), async (req, res) => {
  await service.deleteOrder(actor(req), id(req.params.orderId));
  res.status(204).end();
});
