import { describe, expect, it } from 'vitest';
import { nextPath } from './guards';

describe('nextPath', () => {
  it('keeps in-app paths', () => {
    expect(nextPath('?next=%2Finvite%2Fabc')).toBe('/invite/abc');
  });

  it('refuses external or protocol-relative targets (open redirect)', () => {
    expect(nextPath('?next=https://evil.example')).toBe('/');
    expect(nextPath('?next=//evil.example')).toBe('/');
  });

  it('falls back when missing', () => {
    expect(nextPath('', '/onboarding')).toBe('/onboarding');
  });
});
