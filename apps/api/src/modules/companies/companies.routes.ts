import { Router } from 'express';
import { authenticate, requireCompany, requirePermission } from '../../core/auth/authenticate';
import { companyInvitesRouter } from '../invites/invites.routes';
import * as controller from './companies.controller';

export const companiesRouter = Router();

companiesRouter.use(authenticate);

companiesRouter.post('/', controller.create);

// Everything under /current acts on the company of the signed-in session.
companiesRouter.use('/current', requireCompany);
companiesRouter.get('/current', controller.getCurrent);
companiesRouter.patch('/current', requirePermission('settings:manage'), controller.updateCurrent);
companiesRouter.get('/current/members', controller.listMembers);
companiesRouter.patch(
  '/current/members/:userId',
  requirePermission('members:manage'),
  controller.updateMember,
);
companiesRouter.delete(
  '/current/members/:userId',
  requirePermission('members:manage'),
  controller.removeMember,
);
companiesRouter.use('/current/invites', requirePermission('members:manage'), companyInvitesRouter);
