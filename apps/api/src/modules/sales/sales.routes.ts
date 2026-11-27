import {
  objectIdSchema,
  orderConsumptionSchema,
  saleCancelSchema,
  saleDraftQuerySchema,
  saleFiltersSchema,
  saleInputSchema,
  saleReceiptSchema,
} from '@printbi/shared';
import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import {
  authenticate,
  getCompanyAuth,
  requireCompany,
  requirePermission,
} from '../../core/auth/authenticate';
import { idempotencyKey } from '../../core/http/idempotency';
import { parseInput } from '../../core/http/validate';
import * as service from './sales.service';

/**
 * Sales are financial: reading needs `finance:view`; registering, editing and receipts need
 * `finance:manage`; cancelling and deleting also need the archive permission.
 */
export const salesRouter = Router();
salesRouter.use(authenticate, requireCompany, requirePermission('finance:view'));

const manage = requirePermission('finance:manage');
const archive = requirePermission('records:archive');
const id = (value: unknown) => new Types.ObjectId(parseInput(objectIdSchema, value));
function actor(req: Request) {
  const auth = getCompanyAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    canSeeFinance: true,
    canManageFinance: auth.permissions.includes('finance:manage'),
  };
}

salesRouter.get('/', async (req, res) => {
  res.json(await service.listSales(actor(req), parseInput(saleFiltersSchema, req.query)));
});

salesRouter.get('/draft', async (req, res) => {
  res.json(await service.draftSale(actor(req), parseInput(saleDraftQuerySchema, req.query)));
});

salesRouter.post('/', manage, async (req, res) => {
  res.status(201).json(await service.createSale(actor(req), parseInput(saleInputSchema, req.body)));
});

salesRouter.get('/:saleId', async (req, res) => {
  res.json(await service.getSale(actor(req), id(req.params.saleId)));
});

salesRouter.put('/:saleId', manage, async (req, res) => {
  res.json(
    await service.updateSale(
      actor(req),
      id(req.params.saleId),
      parseInput(saleInputSchema, req.body),
    ),
  );
});

salesRouter.post('/:saleId/receipts', manage, async (req, res) => {
  res
    .status(201)
    .json(
      await service.addReceipt(
        actor(req),
        id(req.params.saleId),
        parseInput(saleReceiptSchema, req.body),
      ),
    );
});

salesRouter.delete('/:saleId/receipts/:receiptId', manage, async (req, res) => {
  res.json(
    await service.removeReceipt(actor(req), id(req.params.saleId), id(req.params.receiptId)),
  );
});

salesRouter.post('/:saleId/cancel', manage, archive, async (req, res) => {
  res.json(
    await service.cancelSale(
      actor(req),
      id(req.params.saleId),
      parseInput(saleCancelSchema, req.body),
    ),
  );
});

salesRouter.get('/:saleId/movements', async (req, res) => {
  res.json(await service.listSaleMovements(actor(req), id(req.params.saleId)));
});

salesRouter.post('/:saleId/consumptions', manage, async (req, res) => {
  const { movements, replayed } = await service.recordSaleUsage(
    actor(req),
    id(req.params.saleId),
    parseInput(orderConsumptionSchema, req.body),
    idempotencyKey(req),
  );
  if (replayed) res.set('Idempotent-Replayed', 'true');
  res.status(replayed ? 200 : 201).json(movements);
});

salesRouter.delete('/:saleId', manage, archive, async (req, res) => {
  await service.deleteSale(actor(req), id(req.params.saleId));
  res.status(204).end();
});
