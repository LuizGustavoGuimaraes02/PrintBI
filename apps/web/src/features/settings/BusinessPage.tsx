import { zodResolver } from '@hookform/resolvers/zod';
import { updateCompanyProfileSchema, type AccountView, type CompanyView } from '@printbi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button, ImageSlot, Notice, PageLoader, Panel, TextField } from '../../design-system';
import { api } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { accountKey, useCan } from '../auth/account';
import { companyBase, keys, useCompany, useSaving } from './queries';

type ProfileForm = z.input<typeof updateCompanyProfileSchema>;

const toForm = (company: CompanyView): ProfileForm => ({
  name: company.name,
  email: company.email,
  phone: company.phone,
  address: company.address,
  website: company.website,
  social: company.social,
});

export function BusinessPage() {
  const { data: company } = useCompany();
  if (!company) return <PageLoader />;
  return <BusinessForm company={company} />;
}

function BusinessForm({ company }: { company: CompanyView }) {
  const canManage = useCan('settings:manage');
  const queryClient = useQueryClient();
  const save = useSaving(
    (values: ProfileForm) => api.patch<CompanyView>(companyBase, values),
    [keys.company],
    'Business details saved',
  );
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(updateCompanyProfileSchema, undefined, { raw: true }),
    defaultValues: toForm(company),
  });
  const guard = useUnsavedChangesGuard(isDirty);

  useEffect(() => reset(toForm(company)), [company, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync(values);
      reset(toForm(saved));
      // The company name also shows in the account menu.
      queryClient.setQueryData<AccountView | null>(accountKey, (account) =>
        account?.activeCompany
          ? {
              ...account,
              activeCompany: { ...account.activeCompany, name: saved.name },
              companies: account.companies.map((c) =>
                c.id === saved.id ? { ...c, name: saved.name } : c,
              ),
            }
          : account,
      );
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  return (
    <Panel title="Business details" description="Shown on quotes and on your public showcase.">
      {guard}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <fieldset disabled={!canManage} className="grid gap-6 md:grid-cols-[1fr_auto]">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Business name"
              required
              className="sm:col-span-2"
              error={errors.name?.message}
              {...register('name')}
            />
            <TextField
              label="Email"
              type="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <TextField
              label="Phone / WhatsApp"
              type="tel"
              error={errors.phone?.message}
              {...register('phone')}
            />
            <TextField
              label="Address"
              className="sm:col-span-2"
              error={errors.address?.message}
              {...register('address')}
            />
            <TextField label="Website" error={errors.website?.message} {...register('website')} />
            <TextField
              label="Social link"
              hint="Instagram, Facebook or similar"
              error={errors.social?.message}
              {...register('social')}
            />
          </div>
          <ImageSlot label="Logo" size="512 × 512" formats="PNG, SVG or WebP · up to 1 MB">
            <p className="max-w-56 text-xs text-ink-muted">
              Logo upload arrives with image storage in Part 4b.
            </p>
          </ImageSlot>
        </fieldset>
        {errors.root?.server && (
          <Notice tone="attention" title="Not saved">
            {errors.root.server.message}
          </Notice>
        )}
        {canManage && (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={save.isPending} disabled={!isDirty}>
              Save
            </Button>
            <Button variant="ghost" disabled={!isDirty} onClick={() => reset(toForm(company))}>
              Cancel
            </Button>
          </div>
        )}
      </form>
    </Panel>
  );
}
