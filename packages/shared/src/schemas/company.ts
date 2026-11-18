import { z } from 'zod';
import { ROLES } from '../permissions';
import { emailSchema } from './auth';
import { objectIdSchema } from './common';

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const companyNameSchema = z
  .string()
  .trim()
  .min(2, 'Use at least 2 characters')
  .max(80, 'Use at most 80 characters');

export const createCompanySchema = z.object({ name: companyNameSchema });

export const updateCompanyProfileSchema = z
  .object({
    name: companyNameSchema,
    email: z.union([emailSchema, z.literal('')]),
    phone: optionalText(40),
    address: optionalText(200),
    website: optionalText(200),
    social: optionalText(200),
  })
  .partial();

export const switchCompanySchema = z.object({ companyId: objectIdSchema });

export const roleSchema = z.enum(ROLES);

export const createInviteSchema = z.object({
  email: emailSchema,
  role: roleSchema.default('employee'),
  finance: z.boolean().default(false),
});

export const updateMemberSchema = z
  .object({ role: roleSchema, finance: z.boolean() })
  .partial()
  .refine((value) => value.role !== undefined || value.finance !== undefined, {
    message: 'Nothing to update',
  });
