import { describe, expect, it } from 'vitest';
import { emailSchema, passwordSchema, registerSchema } from './auth';

describe('auth schemas', () => {
  it('normalizes emails and rejects malformed ones', () => {
    expect(emailSchema.parse('  Luiz@Example.COM ')).toBe('luiz@example.com');
    for (const bad of ['luiz', 'luiz@example', 'luiz@example.c', 'a b@x.com']) {
      expect(emailSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('requires 8+ characters with a letter and a number', () => {
    expect(passwordSchema.safeParse('abc12345').success).toBe(true);
    expect(passwordSchema.safeParse('ção12345').success).toBe(true);
    expect(passwordSchema.safeParse('abc123').success).toBe(false);
    expect(passwordSchema.safeParse('abcdefgh').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
    expect(passwordSchema.safeParse(`a1${'x'.repeat(127)}`).success).toBe(false);
  });

  it('trims names and requires 2+ characters', () => {
    const parsed = registerSchema.parse({
      firstName: '  Luiz ',
      lastName: 'Gu',
      email: 'luiz@example.com',
      password: 'abc12345',
    });
    expect(parsed.firstName).toBe('Luiz');
    expect(registerSchema.safeParse({ ...parsed, lastName: ' G ' }).success).toBe(false);
  });
});
