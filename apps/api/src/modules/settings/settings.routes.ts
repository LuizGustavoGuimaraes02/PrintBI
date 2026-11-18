import { updateSettingsSchema } from '@printbi/shared';
import { Router } from 'express';
import { getCompanyAuth, requirePermission } from '../../core/auth/authenticate';
import { parseInput } from '../../core/http/validate';
import * as service from './settings.service';

/** Mounted under /companies/current/settings (members read, `settings:manage` writes). */
export const settingsRouter = Router();

settingsRouter.get('/', async (req, res) => {
  res.json(await service.getSettings(getCompanyAuth(req).companyId));
});

settingsRouter.patch('/', requirePermission('settings:manage'), async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(updateSettingsSchema, req.body);
  res.json(await service.updateSettings(auth.companyId, auth.userId, input));
});
