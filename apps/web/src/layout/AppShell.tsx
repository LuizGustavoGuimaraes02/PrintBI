import type { AccountView } from '@printbi/shared';
import { useMutation } from '@tanstack/react-query';
import { ChevronsUpDown, LogOut, Menu, X } from 'lucide-react';
import { Dialog as RadixDialog, DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Button, cn, Modal, SpoolMark, useToast } from '../design-system';
import { useAccount, useSetAccount } from '../features/auth/account';
import { useInactivityLogout } from '../features/auth/useInactivityLogout';
import { api, ApiError } from '../lib/api';
import { NAV_ITEMS } from './navigation';

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon, part }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-full px-4 py-2.5 text-[15px] transition-colors',
                isActive
                  ? 'bg-glow font-bold text-[#0b2e33]'
                  : 'text-[#c3ced2] hover:bg-[#1f333b] hover:text-white',
              )
            }
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {part && <span className="figure text-[11px] opacity-70">P{part}</span>}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function AccountMenu({ account }: { account: AccountView }) {
  const navigate = useNavigate();
  const setAccount = useSetAccount();
  const toast = useToast();
  const company = account.activeCompany;

  const switchCompany = useMutation({
    mutationFn: (companyId: string) => api.post<AccountView>('/auth/switch-company', { companyId }),
    onSuccess: (next) => {
      setAccount(next);
      toast.success('Switched company', next.activeCompany?.name);
      void navigate('/');
    },
    onError: (error) =>
      toast.error('Could not switch', error instanceof ApiError ? error.message : undefined),
  });

  const signOut = async (everywhere: boolean) => {
    await api.post(everywhere ? '/auth/logout-all' : '/auth/logout').catch(() => undefined);
    setAccount(null);
    void navigate('/login', { replace: true });
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-[18px] bg-[#1f333b] px-3 py-2.5 text-left text-white hover:bg-[#2a3d45]"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-glow font-bold text-[#0b2e33]">
            {account.user.firstName.charAt(0).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">
              {account.user.firstName} {account.user.lastName}
            </span>
            <span className="label-mono truncate text-[11px] text-[#c3ced2]">
              {company?.name} · {company?.role}
            </span>
          </span>
          <ChevronsUpDown size={16} aria-hidden="true" className="text-[#c3ced2]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 min-w-64 rounded-[18px] bg-surface p-2 shadow-[var(--shadow-pop)]"
        >
          {account.companies.length > 1 && (
            <>
              <DropdownMenu.Label className="label-mono px-3 py-2 text-ink-muted">
                Switch company
              </DropdownMenu.Label>
              {account.companies.map((c) => (
                <DropdownMenu.Item
                  key={c.id}
                  disabled={c.id === company?.id}
                  onSelect={() => switchCompany.mutate(c.id)}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[15px] outline-none data-[disabled]:cursor-default data-[disabled]:font-bold data-[highlighted]:bg-bench"
                >
                  {c.name}
                  <span className="label-mono text-ink-muted">{c.role}</span>
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="my-1 h-px bg-rule-soft" />
            </>
          )}
          <DropdownMenu.Item
            onSelect={() => void signOut(false)}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] outline-none data-[highlighted]:bg-bench"
          >
            <LogOut size={16} aria-hidden="true" /> Sign out
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void signOut(true)}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] outline-none data-[highlighted]:bg-bench"
          >
            <LogOut size={16} aria-hidden="true" /> Sign out on every device
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SidebarContent({
  account,
  onNavigate,
}: {
  account: AccountView;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center gap-2.5 px-3">
        <SpoolMark />
        <span className="text-xl font-extrabold tracking-[-0.02em] text-white">PrintBI</span>
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto">
        <NavList onNavigate={onNavigate} />
      </nav>
      <AccountMenu account={account} />
    </div>
  );
}

/** Signed-in frame: sidebar on desktop, a drawer on phones and tablets. */
export function AppShell() {
  const { data: account } = useAccount();
  const setAccount = useSetAccount();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { secondsLeft, stayActive } = useInactivityLogout(Boolean(account), () => {
    void api.post('/auth/logout').catch(() => undefined);
    setAccount(null);
    void navigate('/login?reason=idle', { replace: true });
  });

  if (!account) return null;

  return (
    <div className="flex min-h-screen gap-5 p-3 md:p-5">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-teal px-4 py-2 font-bold text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Skip to content
      </a>

      <aside className="sticky top-5 hidden h-[calc(100vh-40px)] w-64 shrink-0 rounded-[var(--radius-card)] bg-ink px-3 py-6 lg:block">
        <SidebarContent account={account} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <header className="flex items-center justify-between rounded-[var(--radius-card)] bg-ink px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2.5">
            <SpoolMark size={24} />
            <span className="text-lg font-extrabold text-white">PrintBI</span>
          </div>
          <RadixDialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <RadixDialog.Trigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="grid size-11 place-items-center rounded-full text-white hover:bg-[#1f333b]"
              >
                <Menu size={22} aria-hidden="true" />
              </button>
            </RadixDialog.Trigger>
            <RadixDialog.Portal>
              <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/40 motion-safe:animate-fade-in" />
              <RadixDialog.Content className="fixed inset-y-0 left-0 z-50 w-[min(320px,86vw)] bg-ink px-3 py-6 motion-safe:animate-slide-in">
                <RadixDialog.Title className="sr-only">Menu</RadixDialog.Title>
                <RadixDialog.Description className="sr-only">
                  Main navigation
                </RadixDialog.Description>
                <RadixDialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close menu"
                    className="absolute top-5 right-4 grid size-10 place-items-center rounded-full text-white hover:bg-[#1f333b]"
                  >
                    <X size={20} aria-hidden="true" />
                  </button>
                </RadixDialog.Close>
                <SidebarContent account={account} onNavigate={() => setDrawerOpen(false)} />
              </RadixDialog.Content>
            </RadixDialog.Portal>
          </RadixDialog.Root>
        </header>

        <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-5 outline-none">
          <Outlet />
        </main>
      </div>

      <Modal
        open={secondsLeft !== null}
        onOpenChange={(open) => !open && stayActive()}
        title="Still there?"
        description="For your security you will be signed out after 30 minutes without activity."
        footer={<Button onClick={stayActive}>Stay signed in</Button>}
      >
        <p className="figure text-[40px] font-medium">
          {Math.floor((secondsLeft ?? 0) / 60)}:{String((secondsLeft ?? 0) % 60).padStart(2, '0')}
        </p>
      </Modal>
    </div>
  );
}
