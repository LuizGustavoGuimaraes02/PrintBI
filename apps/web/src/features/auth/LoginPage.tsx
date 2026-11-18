import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type AccountView, type LoginInput } from '@printbi/shared';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button, Notice, TextField } from '../../design-system';
import { AuthLayout } from '../../layout/AuthLayout';
import { api } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import { useSetAccount } from './account';
import { nextPath } from './guards';

const REASONS: Record<string, string> = {
  idle: 'You were signed out after 30 minutes without activity.',
  expired: 'Your session ended. Please sign in again.',
  reset: 'Your password was changed. Sign in with the new one.',
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAccount = useSetAccount();
  const reason = REASONS[new URLSearchParams(location.search).get('reason') ?? ''];
  const next = nextPath(location.search);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema, undefined, { raw: true }) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      setAccount(await api.post<AccountView>('/auth/login', values));
      void navigate(next, { replace: true });
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back to the workshop.">
      {reason && <Notice title="Signed out">{reason}</Notice>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          error={errors.password?.message}
          {...register('password')}
        />
        {errors.root?.server && (
          <Notice tone="attention" title="Could not sign in">
            {errors.root.server.message}
          </Notice>
        )}
        <Button type="submit" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
      <div className="flex flex-wrap justify-between gap-3 text-[15px]">
        <Link to="/forgot-password" className="font-semibold text-teal hover:text-teal-strong">
          Forgot your password?
        </Link>
        <Link
          to={`/register${location.search}`}
          className="font-semibold text-teal hover:text-teal-strong"
        >
          Create an account
        </Link>
      </div>
    </AuthLayout>
  );
}
