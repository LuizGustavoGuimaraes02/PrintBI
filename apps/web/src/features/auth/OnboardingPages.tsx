import { zodResolver } from '@hookform/resolvers/zod';
import { createCompanySchema, type AccountView, type InvitePreview } from '@printbi/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { Badge, Button, Notice, PageLoader, TextField } from '../../design-system';
import { AuthLayout } from '../../layout/AuthLayout';
import { api, ApiError } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import { useAccount, useSetAccount } from './account';

export function CreateCompanyPage() {
  const navigate = useNavigate();
  const setAccount = useSetAccount();
  const { data: account } = useAccount();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ name: string }>({
    resolver: zodResolver(createCompanySchema, undefined, { raw: true }),
  });

  if (account?.activeCompany) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      setAccount(await api.post<AccountView>('/companies', values));
      void navigate('/', { replace: true });
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  return (
    <AuthLayout
      title={`Hi ${account?.user.firstName ?? 'there'}, name your business`}
      subtitle="You will be its admin. You can invite your team and change these details later."
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <TextField
          label="Business name"
          autoComplete="organization"
          required
          error={errors.name?.message}
          {...register('name')}
        />
        {errors.root?.server && (
          <Notice tone="attention" title="Could not create">
            {errors.root.server.message}
          </Notice>
        )}
        <Button type="submit" loading={isSubmitting}>
          Create business
        </Button>
      </form>
      <Notice title="Joining a team instead?">
        Open the invite link your admin sent you while signed in to this account.
      </Notice>
    </AuthLayout>
  );
}

export function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const setAccount = useSetAccount();
  const { data: account, isPending: accountPending } = useAccount();
  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get<InvitePreview>(`/invites/${encodeURIComponent(token)}`),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => api.post<AccountView>('/invites/accept', { token }),
    onSuccess: (next) => {
      setAccount(next);
      void navigate('/', { replace: true });
    },
  });

  if (preview.isPending || accountPending) return <PageLoader label="Opening invite" />;

  const here = encodeURIComponent(`/invite/${token}`);
  const invite = preview.data;

  return (
    <AuthLayout title={invite ? `Join ${invite.companyName}` : 'Invite not found'}>
      {!invite && (
        <Notice tone="attention" title="Invalid link">
          This invite does not exist. Check the link or ask for a new invite.
        </Notice>
      )}
      {invite && invite.status !== 'valid' && (
        <Notice tone="attention" title={`Invite ${invite.status}`}>
          This invite can no longer be used. Ask the admin of {invite.companyName} for a new one.
        </Notice>
      )}
      {invite?.status === 'valid' && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-tile)] bg-bench p-4">
            <span className="figure text-[15px]">{invite.email}</span>
            <Badge tone="teal">{invite.role}</Badge>
          </div>
          {!account && (
            <div className="flex flex-col gap-3">
              <p className="text-ink-muted">
                Sign in or create an account with {invite.email} to accept.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to={`/login?next=${here}`}
                  className="inline-flex h-12 items-center rounded-full bg-teal px-6 font-bold text-white hover:bg-teal-strong"
                >
                  Sign in
                </Link>
                <Link
                  to={`/register?next=${here}`}
                  className="inline-flex h-12 items-center rounded-full bg-teal-soft px-6 font-bold text-teal-ink"
                >
                  Create account
                </Link>
              </div>
            </div>
          )}
          {account && account.user.email !== invite.email && (
            <Notice tone="attention" title="Different account">
              You are signed in as {account.user.email}. This invite is for {invite.email}.
            </Notice>
          )}
          {account && account.user.email === invite.email && (
            <>
              {accept.error && (
                <Notice tone="attention" title="Could not join">
                  {accept.error instanceof ApiError ? accept.error.message : 'Please try again.'}
                </Notice>
              )}
              <Button loading={accept.isPending} onClick={() => accept.mutate()}>
                Accept and join
              </Button>
            </>
          )}
        </>
      )}
    </AuthLayout>
  );
}
