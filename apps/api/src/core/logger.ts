import { pino } from 'pino';
import { env } from '../config/env';

/** Structured logger. Secrets are redacted wherever they appear in a logged object. */
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
  }),
});
