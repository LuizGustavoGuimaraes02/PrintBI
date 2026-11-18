import { z } from 'zod';

/** Same rule the reference project (Manage My Shifts) uses on its client. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
export const PASSWORD_MIN_LENGTH = 8;
/** Upper bound keeps hashing cost predictable (no multi-megabyte passwords). */
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .regex(EMAIL_PATTERN, 'Enter a valid email');

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/\p{L}/u, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export const personNameSchema = z
  .string()
  .trim()
  .min(2, 'Use at least 2 characters')
  .max(60, 'Use at most 60 characters');

export const registerSchema = z.object({
  firstName: personNameSchema,
  lastName: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Not validated against the rules: old or wrong passwords must just fail to match.
  password: z.string().min(1, 'Enter your password').max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.input<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const tokenSchema = z.string().trim().min(20).max(200);

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
