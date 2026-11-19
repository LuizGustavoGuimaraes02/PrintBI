import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env';

const tooMany = { message: 'Too many attempts. Try again in a few minutes.', code: 'RATE_LIMITED' };

/**
 * Strict limit for login, registration, password reset and invite lookups.
 * In-memory store: fine for one instance; use a shared store (e.g. Redis) when scaling out.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.AUTH_RATE_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: tooMany,
});

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.AUTH_RATE_LIMIT * 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ...tooMany, message: 'Too many requests. Try again in a few minutes.' },
});

/** Public showcase pages: generous for browsing, still capped against scraping. */
export const publicRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.AUTH_RATE_LIMIT * 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ...tooMany, message: 'Too many requests. Try again in a few minutes.' },
});
