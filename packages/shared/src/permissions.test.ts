import { describe, expect, it } from 'vitest';
import { hasPermission, permissionsFor } from './permissions';

describe('permissions', () => {
  it('gives admins every permission', () => {
    expect(permissionsFor({ role: 'admin', finance: false })).toContain('members:manage');
    expect(hasPermission({ role: 'admin', finance: false }, 'finance:view')).toBe(true);
  });

  it('gives employees no financial access by default', () => {
    expect(permissionsFor({ role: 'employee', finance: false })).toEqual([]);
  });

  it('gives employees financial access only when the admin enables it', () => {
    const grants = { role: 'employee', finance: true } as const;
    expect(hasPermission(grants, 'finance:view')).toBe(true);
    expect(hasPermission(grants, 'members:manage')).toBe(false);
    expect(hasPermission(grants, 'records:archive')).toBe(false);
  });
});
