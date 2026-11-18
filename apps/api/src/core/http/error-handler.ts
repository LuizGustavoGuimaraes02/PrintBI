import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError, NotFoundError } from '../errors';
import { logger } from '../logger';

interface ErrorBody {
  message: string;
  code: string;
  details?: unknown;
}

const MONGO_DUPLICATE_KEY = 11000;

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

function bodyParserType(error: unknown): string | undefined {
  const type = (error as { type?: unknown } | null)?.type;
  return typeof type === 'string' ? type : undefined;
}

/** Maps any thrown value to an HTTP status and a safe, client-facing body. */
export function toHttpError(error: unknown): { status: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        message: error.message,
        code: error.code,
        ...(error.details !== undefined && { details: error.details }),
      },
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        message: 'Some fields are invalid',
        code: 'VALIDATION_ERROR',
        details: error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      },
    };
  }
  // A malformed id can never match a record: answer like any missing record.
  if (error instanceof mongoose.Error.CastError) {
    return toHttpError(new NotFoundError());
  }
  if (error instanceof mongoose.Error.ValidationError) {
    return {
      status: 400,
      body: {
        message: 'Some fields are invalid',
        code: 'VALIDATION_ERROR',
        details: Object.values(error.errors).map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      },
    };
  }
  if (hasCode(error, MONGO_DUPLICATE_KEY)) {
    return { status: 409, body: { message: 'This record already exists', code: 'CONFLICT' } };
  }
  switch (bodyParserType(error)) {
    case 'entity.parse.failed':
      return { status: 400, body: { message: 'Malformed JSON body', code: 'BAD_REQUEST' } };
    case 'entity.too.large':
      return {
        status: 413,
        body: { message: 'Request body is too large', code: 'PAYLOAD_TOO_LARGE' },
      };
  }
  return { status: 500, body: { message: 'Something went wrong', code: 'INTERNAL_ERROR' } };
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const { status, body } = toHttpError(error);
  if (status >= 500) {
    logger.error({ err: error, method: req.method, url: req.originalUrl }, 'Unhandled error');
  }
  res.status(status).json(body);
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found`, code: 'NOT_FOUND' });
};
