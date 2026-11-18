import { createInviteSchema, objectIdSchema, tokenSchema } from '@printbi/shared';
import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { getAuth, getCompanyAuth } from '../../core/auth/authenticate';
import { setAuthCookies } from '../../core/auth/cookies';
import { parseInput } from '../../core/http/validate';
import { issueTokens } from '../auth/issue-tokens';
import { getAccount } from '../users/account.service';
import * as service from './invites.service';

export const create: RequestHandler = async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(createInviteSchema, req.body);
  res.status(201).json(await service.createInvite(auth.companyId, auth.userId, input));
};

export const listPending: RequestHandler = async (req, res) => {
  res.json(await service.listPendingInvites(getCompanyAuth(req).companyId));
};

export const revoke: RequestHandler = async (req, res) => {
  const auth = getCompanyAuth(req);
  const inviteId = new Types.ObjectId(parseInput(objectIdSchema, req.params.inviteId));
  await service.revokeInvite(auth.companyId, auth.userId, inviteId);
  res.status(204).end();
};

export const preview: RequestHandler = async (req, res) => {
  res.json(await service.previewInvite(parseInput(tokenSchema, req.params.token)));
};

export const accept: RequestHandler = async (req, res) => {
  const auth = getAuth(req);
  const { token } = parseInput(z.object({ token: tokenSchema }), req.body);
  const companyId = await service.acceptInvite(auth.userId, auth.email, auth.sessionId, token);
  setAuthCookies(res, await issueTokens(auth.userId, auth.sessionId, companyId));
  res.json(await getAccount(auth.userId, companyId));
};
