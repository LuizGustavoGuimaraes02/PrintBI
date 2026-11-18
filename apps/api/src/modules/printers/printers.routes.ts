import { objectIdSchema, printerInputSchema } from '@printbi/shared';
import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { getCompanyAuth, requirePermission } from '../../core/auth/authenticate';
import { parseInput } from '../../core/http/validate';
import * as service from './printers.service';

/** Mounted under /companies/current/printers. Everyone sees the list (to assign jobs). */
export const printersRouter = Router();

const printerId = (req: Request) =>
  new Types.ObjectId(parseInput(objectIdSchema, req.params.printerId));

printersRouter.get('/', async (req, res) => {
  const auth = getCompanyAuth(req);
  res.json(await service.listPrinters(auth.companyId, auth.permissions.includes('finance:view')));
});

printersRouter.post('/', requirePermission('settings:manage'), async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(printerInputSchema, req.body);
  res.status(201).json(await service.createPrinter(auth.companyId, auth.userId, input));
});

printersRouter.put('/:printerId', requirePermission('settings:manage'), async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(printerInputSchema, req.body);
  res.json(await service.updatePrinter(auth.companyId, auth.userId, printerId(req), input));
});

printersRouter.delete('/:printerId', requirePermission('settings:manage'), async (req, res) => {
  const auth = getCompanyAuth(req);
  await service.archivePrinter(auth.companyId, auth.userId, printerId(req));
  res.status(204).end();
});
