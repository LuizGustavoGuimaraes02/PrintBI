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

/**
 * Checks a payload with a shared schema before sending it. Each issue lands on the form
 * field that `toField` maps its path to. Returns false when something is invalid.
 */
export function checkPayload<T extends FieldValues>(
  schema: z.ZodType,
  payload: unknown,
  setError: UseFormSetError<T>,
  toField: (path: string) => string = (path) => path,
): boolean {
  const result = schema.safeParse(payload);
  if (result.success) return true;
  for (const issue of result.error.issues) {
    setError(toField(issue.path.map(String).join('.')) as Path<T>, {
      type: 'schema',
      message: issue.message,
    });
  }
  return false;
}

/** Server validation errors mapped onto the form; anything else becomes a form-level error. */
export function applyMappedServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  toField: (path: string) => string,
): void {
  const fields = error instanceof ApiError ? Object.entries(error.fieldErrors()) : [];
  if (fields.length === 0) return applyServerErrors(error, setError);
  for (const [path, message] of fields)
    setError(toField(path) as Path<T>, { type: 'server', message });
}
