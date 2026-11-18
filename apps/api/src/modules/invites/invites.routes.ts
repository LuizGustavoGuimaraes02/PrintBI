import { Router } from 'express';
import { authenticate } from '../../core/auth/authenticate';
import { authRateLimit } from '../../core/auth/rate-limit';
import * as controller from './invites.controller';

/** Mounted under /companies/current/invites, behind `members:manage`. */
export const companyInvitesRouter = Router();
companyInvitesRouter.get('/', controller.listPending);
companyInvitesRouter.post('/', controller.create);
companyInvitesRouter.delete('/:inviteId', controller.revoke);

/** Invite links: public preview, and acceptance by the signed-in invitee. */
export const invitesRouter = Router();
invitesRouter.get('/:token', authRateLimit, controller.preview);
invitesRouter.post('/accept', authenticate, authRateLimit, controller.accept);
