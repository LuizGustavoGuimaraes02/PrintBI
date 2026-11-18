/**
 * Roles and permissions, shared by the API (enforcement) and the web app (what to show).
 * The server is the only authority; the client uses this to hide what would be refused.
 */
export const ROLES = ['admin', 'employee'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'finance:view', // expenses, sales, profit, costs, financial dashboard metrics and exports
  'finance:manage', // register sales, payments and expenses
  'records:archive', // archive or cancel sensitive records
  'members:manage', // invite, change roles and permissions, remove members
  'settings:manage', // business profile, currency, defaults, printers, categories
  'showcase:manage', // public showcase visibility, seasonal pages
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface MembershipGrants {
  role: Role;
  /** Admin-controlled switch that gives an employee access to financial data. */
  finance: boolean;
}

const ADMIN_PERMISSIONS: readonly Permission[] = PERMISSIONS;
const FINANCE_PERMISSIONS: readonly Permission[] = ['finance:view', 'finance:manage'];

export function permissionsFor({ role, finance }: MembershipGrants): Permission[] {
  if (role === 'admin') return [...ADMIN_PERMISSIONS];
  return finance ? [...FINANCE_PERMISSIONS] : [];
}

export function hasPermission(grants: MembershipGrants, permission: Permission): boolean {
  return permissionsFor(grants).includes(permission);
}
