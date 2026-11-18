import { zodResolver } from '@hookform/resolvers/zod';
import { createInviteSchema, type InviteView, type MemberView, type Role } from '@printbi/shared';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Notice,
  PageLoader,
  Panel,
  SelectField,
  SwitchField,
  TextField,
  useToast,
} from '../../design-system';
import { api } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import { useAccount, useCan } from '../auth/account';
import { companyBase, keys, useInvites, useMembers, useSaving } from './queries';

const dateFormat = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium' });

export function TeamPage() {
  const canManage = useCan('members:manage');
  return (
    <>
      <MembersPanel canManage={canManage} />
      {canManage && <InvitesPanel />}
    </>
  );
}

function MembersPanel({ canManage }: { canManage: boolean }) {
  const { data: members } = useMembers();
  const { data: account } = useAccount();
  const [removing, setRemoving] = useState<MemberView | null>(null);

  const update = useSaving(
    ({ userId, ...input }: { userId: string; role?: Role; finance?: boolean }) =>
      api.patch<MemberView>(`${companyBase}/members/${userId}`, input),
    [keys.members],
    'Member updated',
  );
  const remove = useSaving(
    (userId: string) => api.delete(`${companyBase}/members/${userId}`),
    [keys.members],
    'Member removed',
  );

  if (!members) return <PageLoader />;

  return (
    <Panel
      title="Team"
      description="Admins can do everything. Employees see financial data only when you allow it."
    >
      <ul className="flex flex-col">
        {members.map((member) => {
          const isMe = member.userId === account?.user.id;
          return (
            <li
              key={member.userId}
              className="grid gap-4 border-t border-rule-soft py-4 first:border-t-0 first:pt-0 md:grid-cols-[1fr_180px_220px_auto] md:items-center"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-bold">
                  {member.firstName} {member.lastName}{' '}
                  {isMe && <span className="font-normal text-ink-muted">(you)</span>}
                </span>
                <span className="figure truncate text-[13px] text-ink-muted">{member.email}</span>
              </div>
              {canManage ? (
                <>
                  <SelectField
                    label="Role"
                    value={member.role}
                    onChange={(e) =>
                      update.mutate({ userId: member.userId, role: e.target.value as Role })
                    }
                  >
                    <option value="admin">Admin</option>
                    <option value="employee">Employee</option>
                  </SelectField>
                  {member.role === 'employee' ? (
                    <SwitchField
                      label="Financial access"
                      checked={member.finance}
                      onCheckedChange={(finance) =>
                        update.mutate({ userId: member.userId, finance })
                      }
                    />
                  ) : (
                    <span className="text-sm text-ink-muted">Admins always see finances</span>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(member)}>
                    Remove
                  </Button>
                </>
              ) : (
                <div className="flex gap-2 md:col-span-3">
                  <Badge tone="teal">{member.role}</Badge>
                  {member.finance && <Badge>finance</Badge>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.firstName ?? ''}?`}
        description="They lose access right away. Everything they recorded stays in your history."
        confirmLabel="Remove member"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (removing) remove.mutate(removing.userId, { onSettled: () => setRemoving(null) });
        }}
      />
    </Panel>
  );
}

type InviteForm = z.input<typeof createInviteSchema>;

function InvitesPanel() {
  const toast = useToast();
  const { data: invites } = useInvites(true);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const create = useSaving(
    (values: InviteForm) =>
      api.post<{ invite: InviteView; link: string }>(`${companyBase}/invites`, values),
    [keys.invites],
    'Invite created',
  );
  const revoke = useSaving(
    (id: string) => api.delete(`${companyBase}/invites/${id}`),
    [keys.invites],
    'Invite cancelled',
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<InviteForm>({
    resolver: zodResolver(createInviteSchema, undefined, { raw: true }),
    defaultValues: { email: '', role: 'employee', finance: false },
  });

  const role = useWatch({ control, name: 'role' });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { link } = await create.mutateAsync(values);
      setLastLink(link);
      reset();
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy', 'Select the link and copy it manually.');
    }
  };

  return (
    <Panel
      title="Invite someone"
      description="Invites are tied to an email, work once and expire in 7 days. Copy the link and send it yourself."
    >
      <form
        onSubmit={onSubmit}
        noValidate
        className="grid gap-5 md:grid-cols-[1fr_180px] md:items-start"
      >
        <TextField
          label="Email"
          type="email"
          required
          error={errors.email?.message}
          {...register('email')}
        />
        <SelectField label="Role" error={errors.role?.message} {...register('role')}>
          <option value="employee">Employee</option>
          <option value="admin">Admin</option>
        </SelectField>
        {role === 'employee' && (
          <Controller
            control={control}
            name="finance"
            render={({ field }) => (
              <div className="md:col-span-2">
                <SwitchField
                  label="Give financial access"
                  description="Expenses, sales, profit and costs."
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              </div>
            )}
          />
        )}
        {errors.root?.server && (
          <div className="md:col-span-2">
            <Notice tone="attention" title="Not created">
              {errors.root.server.message}
            </Notice>
          </div>
        )}
        <div className="md:col-span-2">
          <Button type="submit" loading={create.isPending}>
            Create invite link
          </Button>
        </div>
      </form>

      {lastLink && (
        <Notice
          title="Send this link"
          action={
            <Button
              size="sm"
              variant="soft"
              icon={<Copy size={16} aria-hidden="true" />}
              onClick={() => void copy(lastLink)}
            >
              Copy
            </Button>
          }
        >
          <span className="figure text-[13px] break-all">{lastLink}</span>
        </Notice>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="label-mono text-ink-muted">Pending invites</h3>
        {invites && invites.length === 0 && (
          <EmptyState title="No pending invites">
            New invites will wait here until accepted.
          </EmptyState>
        )}
        <ul className="flex flex-col">
          {invites?.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-soft py-3 first:border-t-0"
            >
              <div className="flex flex-col">
                <span className="figure text-[15px]">{invite.email}</span>
                <span className="text-[13px] text-ink-muted">
                  {invite.role}
                  {invite.role === 'employee' && invite.finance ? ' · financial access' : ''} ·
                  expires {dateFormat.format(new Date(invite.expiresAt))}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                loading={revoke.isPending && revoke.variables === invite.id}
                onClick={() => revoke.mutate(invite.id)}
              >
                Cancel invite
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
