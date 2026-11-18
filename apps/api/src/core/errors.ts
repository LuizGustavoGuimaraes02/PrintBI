/**
 * Typed application errors. Services throw these; the central error handler
 * turns them into `{ message, code, details? }` responses.
 */
export class AppError extends Error {
  override name = 'AppError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Some fields are invalid', details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do this') {
    super(403, 'FORBIDDEN', message);
  }
}

/** Also used for records of other companies, so their existence is never revealed. */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'This conflicts with existing data', details?: unknown) {
    super(409, 'CONFLICT', message, details);
  }
}
