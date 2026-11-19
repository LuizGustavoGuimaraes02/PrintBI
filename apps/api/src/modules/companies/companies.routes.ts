import { Router } from 'express';
import { authenticate, requireCompany, requirePermission } from '../../core/auth/authenticate';
import { categoriesRouter } from '../categories/categories.routes';
import { companyInvitesRouter } from '../invites/invites.routes';
import { printersRouter } from '../printers/printers.routes';
import { settingsRouter } from '../settings/settings.routes';
import { showcaseSettingsRouter } from '../showcase/showcase.routes';
import * as controller from './companies.controller';

export const companiesRouter = Router();

companiesRouter.use(authenticate);

companiesRouter.post('/', controller.create);

// Everything under /current acts on the company of the signed-in session.
companiesRouter.use('/current', requireCompany);
companiesRouter.get('/current', controller.getCurrent);
companiesRouter.patch('/current', requirePermission('settings:manage'), controller.updateCurrent);
companiesRouter.post('/current/logo', requirePermission('settings:manage'), controller.setLogo);
companiesRouter.delete(
  '/current/logo',
  requirePermission('settings:manage'),
  controller.removeLogo,
);
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
companiesRouter.use('/current/settings', settingsRouter);
companiesRouter.use('/current/printers', printersRouter);
companiesRouter.use('/current/expense-categories', categoriesRouter);
companiesRouter.use('/current/showcase', showcaseSettingsRouter);
