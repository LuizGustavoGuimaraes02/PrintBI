import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, PASSWORD_MIN_LENGTH, passwordSchema } from '@printbi/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Button, Notice, TextField } from '../../design-system';
import { AuthLayout } from '../../layout/AuthLayout';
import { api } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({
    resolver: zodResolver(forgotPasswordSchema, undefined, { raw: true }),
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.post('/auth/password/forgot', values);
      setSent(true);
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we will prepare a reset link."
    >
      {sent ? (
        <Notice title="Request received">
          If an account exists for that email, a reset link was created. It works once and expires
          in 30 minutes. Email delivery is not set up yet: in development the link is written to the
          API log.
        </Notice>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            required
            error={errors.email?.message}
            {...register('email')}
          />
          {errors.root?.server && (
            <Notice tone="attention" title="Something went wrong">
              {errors.root.server.message}
            </Notice>
          )}
          <Button type="submit" loading={isSubmitting}>
            Prepare reset link
          </Button>
        </form>
      )}
      <Link to="/login" className="text-[15px] font-semibold text-teal hover:text-teal-strong">
        Back to sign in
      </Link>
    </AuthLayout>
  );
}

const resetFormSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: 'The passwords do not match',
    path: ['confirm'],
  });

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof resetFormSchema>>({
    resolver: zodResolver(resetFormSchema, undefined, { raw: true }),
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await api.post('/auth/password/reset', { token, password });
      void navigate('/login?reason=reset', { replace: true });
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Every device will be signed out after the change."
    >
      {!token ? (
        <Notice tone="attention" title="Link incomplete">
          This reset link is missing its token. Request a new one.
        </Notice>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`}
            error={errors.password?.message}
            {...register('password')}
          />
          <TextField
            label="Repeat the password"
            type="password"
            autoComplete="new-password"
            required
            error={errors.confirm?.message}
            {...register('confirm')}
          />
          {errors.root?.server && (
            <Notice tone="attention" title="Could not reset">
              {errors.root.server.message}
            </Notice>
          )}
          <Button type="submit" loading={isSubmitting}>
            Save new password
          </Button>
        </form>
      )}
      <Link
        to="/forgot-password"
        className="text-[15px] font-semibold text-teal hover:text-teal-strong"
      >
        Request a new link
      </Link>
    </AuthLayout>
  );
}
