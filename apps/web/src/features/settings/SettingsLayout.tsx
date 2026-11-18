import { NavLink, Outlet } from 'react-router';
import { cn, Notice, PageHeader } from '../../design-system';
import { useCan } from '../auth/account';

const SECTIONS = [
  { to: 'business', label: 'Business' },
  { to: 'team', label: 'Team' },
  { to: 'currency', label: 'Currency' },
  { to: 'calculator', label: 'Calculator defaults' },
  { to: 'printers', label: 'Printers' },
  { to: 'inventory', label: 'Stock warnings' },
  { to: 'categories', label: 'Expense categories' },
  { to: 'reminders', label: 'Reminders & board' },
];

export function SettingsLayout() {
  const canManage = useCan('settings:manage');
  return (
    <>
      <PageHeader
        eyebrow="Workshop setup"
        title="Settings"
        description="How your business works: details, team, money and machines."
      />
      <nav aria-label="Settings sections" className="-mx-1 overflow-x-auto px-1">
        <ul className="flex w-max gap-2">
          {SECTIONS.map((section) => (
            <li key={section.to}>
              <NavLink
                to={section.to}
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors',
                    isActive ? 'bg-ink text-white' : 'bg-surface text-ink hover:bg-bench',
                  )
                }
              >
                {section.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {!canManage && (
        <Notice title="View only">
          Only an admin can change these settings. Ask your admin if something needs updating.
        </Notice>
      )}
      <Outlet />
    </>
  );
}
