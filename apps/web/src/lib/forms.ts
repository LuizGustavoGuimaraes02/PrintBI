import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Path, Resolver, UseFormSetError } from 'react-hook-form';
import type { z } from 'zod';
import { ApiError } from './api';

/**
 * Puts server validation messages on their fields; anything else becomes a
 * form-level error under `root.server`.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): void {
  if (error instanceof ApiError) {
    const fields = error.fieldErrors();
    const paths = Object.keys(fields);
    for (const path of paths) {
      setError(path as Path<T>, { type: 'server', message: fields[path] });
    }
    if (paths.length > 0) return;
    setError('root.server' as Path<T>, { type: 'server', message: error.message });
    return;
  }
  setError('root.server' as Path<T>, {
    type: 'server',
    message: 'Could not reach the server. Check your connection.',
  });
}

/**
 * Validates a form with a shared Zod schema but submits the raw values (decimal
 * strings stay strings for the API). `T` is the form's own field shape: schemas
 * that coerce or preprocess have looser input types than the form fields.
 */
export function formResolver<T extends FieldValues>(schema: z.ZodType): Resolver<T> {
  return zodResolver(schema as never, undefined, { raw: true }) as unknown as Resolver<T>;
}
