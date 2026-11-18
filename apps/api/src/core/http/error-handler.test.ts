import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../errors';
import { toHttpError } from './error-handler';

describe('toHttpError', () => {
  it('passes typed application errors through', () => {
    expect(toHttpError(new ConflictError('Email already registered'))).toEqual({
      status: 409,
      body: { message: 'Email already registered', code: 'CONFLICT' },
    });
    expect(toHttpError(new NotFoundError('Spool')).body.message).toBe('Spool not found');
  });

  it('maps Zod errors to 400 with field paths', () => {
    const result = z.object({ name: z.string().min(2) }).safeParse({ name: 'a' });
    const { status, body } = toHttpError(result.error);
    expect(status).toBe(400);
    expect(body.details).toEqual([{ path: 'name', message: expect.any(String) }]);
  });

  it('answers 404 for malformed ids instead of leaking a cast error', () => {
    const castError = new mongoose.Error.CastError('ObjectId', 'not-an-id', '_id');
    expect(toHttpError(castError).status).toBe(404);
  });

  it('maps duplicate-key errors to 409', () => {
    expect(toHttpError({ code: 11000 }).status).toBe(409);
  });

  it('hides internal details of unexpected errors', () => {
    const { status, body } = toHttpError(new Error('connection string with secrets'));
    expect(status).toBe(500);
    expect(body).toEqual({ message: 'Something went wrong', code: 'INTERNAL_ERROR' });
  });
});
