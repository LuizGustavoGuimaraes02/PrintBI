import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { PageLoader } from '../../design-system';
import { onSessionExpired } from '../../lib/api';
import { useAccount, useSetAccount } from './account';

/** Safe in-app redirect target from `?next=` (never an external URL). */
export function nextPath(search: string, fallback = '/'): string {
  const next = new URLSearchParams(search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

/** Root element: sends the user to sign-in whenever the session can no longer be renewed. */
export function SessionWatcher() {
  const navigate = useNavigate();
  const setAccount = useSetAccount();
  useEffect(
    () =>
      onSessionExpired(() => {
        setAccount(null);
        void navigate('/login?reason=expired', { replace: true });
      }),
    [navigate, setAccount],
  );
  return <Outlet />;
}

export function RequireAccount({ children }: { children?: ReactNode }) {
  const { data: account, isPending } = useAccount();
  const location = useLocation();
  if (isPending) return <PageLoader label="Signing in" />;
  if (!account) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children ?? <Outlet />;
}

export function RequireCompany({ children }: { children?: ReactNode }) {
  const { data: account } = useAccount();
  if (!account?.activeCompany) return <Navigate to="/onboarding" replace />;
  return children ?? <Outlet />;
}

export function GuestOnly() {
  const { data: account, isPending } = useAccount();
  const location = useLocation();
  if (isPending) return <PageLoader />;
  if (account) return <Navigate to={nextPath(location.search)} replace />;
  return <Outlet />;
}
