import {
  createCompanySchema,
  objectIdSchema,
  registerImageSchema,
  updateCompanyProfileSchema,
  updateMemberSchema,
} from '@printbi/shared';
import type { Request, RequestHandler } from 'express';
import { Types } from 'mongoose';
import { getAuth, getCompanyAuth } from '../../core/auth/authenticate';
import { setAuthCookies } from '../../core/auth/cookies';
import { parseInput } from '../../core/http/validate';
import { issueTokens } from '../auth/issue-tokens';
import { getAccount } from '../users/account.service';
import * as service from './companies.service';

const userIdParam = (req: Request) =>
  new Types.ObjectId(parseInput(objectIdSchema, req.params.userId));

export const create: RequestHandler = async (req, res) => {
  const auth = getAuth(req);
  const { name } = parseInput(createCompanySchema, req.body);
  const companyId = await service.createCompany(auth.userId, auth.sessionId, name);
  // The session now points at the new company: reissue the access token for it.
  setAuthCookies(res, await issueTokens(auth.userId, auth.sessionId, companyId));
  res.status(201).json(await getAccount(auth.userId, companyId));
};

export const getCurrent: RequestHandler = async (req, res) => {
  res.json(await service.getCompany(getCompanyAuth(req).companyId));
};

export const updateCurrent: RequestHandler = async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(updateCompanyProfileSchema, req.body);
  res.json(await service.updateCompanyProfile(auth.companyId, auth.userId, input));
};

export const listMembers: RequestHandler = async (req, res) => {
  res.json(await service.listMembers(getCompanyAuth(req).companyId));
};

export const updateMember: RequestHandler = async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(updateMemberSchema, req.body);
  res.json(await service.updateMember(auth.companyId, auth.userId, userIdParam(req), input));
};

export const removeMember: RequestHandler = async (req, res) => {
  const auth = getCompanyAuth(req);
  await service.removeMember(auth.companyId, auth.userId, userIdParam(req));
  res.status(204).end();
};

export const setLogo: RequestHandler = async (req, res) => {
  const auth = getCompanyAuth(req);
  const { publicId } = parseInput(registerImageSchema, req.body);
  res.json(await service.setCompanyLogo(auth.companyId, auth.userId, publicId));
};

export const removeLogo: RequestHandler = async (req, res) => {
  const auth = getCompanyAuth(req);
  res.json(await service.removeCompanyLogo(auth.companyId, auth.userId));
};
