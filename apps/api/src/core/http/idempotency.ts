import { IDEMPOTENCY_HEADER, idempotencyKeySchema } from '@printbi/shared';
import type { Request } from 'express';
import { ValidationError } from '../errors';

/**
 * Reads the client's Idempotency-Key. Every request that changes stock or records a
 * payment must send one, so a retry or a double click is answered without writing twice.
 */
export function idempotencyKey(req: Request): string {
  const parsed = idempotencyKeySchema.safeParse(req.get(IDEMPOTENCY_HEADER));
  if (!parsed.success) {
    throw new ValidationError('An Idempotency-Key header is required for this request', [
      {
        path: IDEMPOTENCY_HEADER,
        message: 'Send a unique key (8 to 100 characters) per operation',
      },
    ]);
  }
  return parsed.data;
}

const MONGO_DUPLICATE_KEY = 11000;

export function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === MONGO_DUPLICATE_KEY
  );
}
