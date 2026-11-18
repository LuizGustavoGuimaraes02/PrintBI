import type { z } from 'zod';

/**
 * Parses untrusted input with a Zod schema. A failure throws ZodError, which the
 * error handler turns into a 400 with field-level details.
 */
export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): z.output<TSchema> {
  return schema.parse(input);
}
