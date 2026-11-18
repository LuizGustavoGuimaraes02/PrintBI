import { zodResolver } from '@hookform/resolvers/zod';
import {
  PASSWORD_MIN_LENGTH,
  registerSchema,
  type AccountView,
  type RegisterInput,
} from '@printbi/shared';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button, Notice, TextField } from '../../design-system';
import { AuthLayout } from '../../layout/AuthLayout';
import { api } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import { useSetAccount } from './account';
import { nextPath } from './guards';

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAccount = useSetAccount();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema, undefined, { raw: true }) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      setAccount(await api.post<AccountView>('/auth/register', values));
      // An invite link brings people here with ?next=/invite/...; otherwise set up a business.
      void navigate(nextPath(location.search, '/onboarding'), { replace: true });
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start with your own business, or join one you were invited to."
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="First name"
            autoComplete="given-name"
            required
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <TextField
            label="Last name"
            autoComplete="family-name"
            required
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>
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
          autoComplete="new-password"
          required
          hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`}
          error={errors.password?.message}
          {...register('password')}
        />
        {errors.root?.server && (
          <Notice tone="attention" title="Could not create the account">
            {errors.root.server.message}
          </Notice>
        )}
        <Button type="submit" loading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="text-[15px] text-ink-muted">
        Already have an account?{' '}
        <Link
          to={`/login${location.search}`}
          className="font-semibold text-teal hover:text-teal-strong"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
