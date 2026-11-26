import {
  boardSettingsSchema,
  reminderSettingsSchema,
  type CompanySettingsView,
} from '@printbi/shared';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button, Notice, PageLoader, Panel, SwitchField, TextField } from '../../design-system';
import { applyServerErrors, formResolver } from '../../lib/forms';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { useCan } from '../auth/account';
import { useSettings } from './queries';
import { useSaveSettings } from './useSettingsSection';

const formSchema = z.object({ reminders: reminderSettingsSchema, board: boardSettingsSchema });

const THRESHOLDS = [
  { name: 'quoteWaitingDays', label: 'Waiting for the quote or the customer' },
  { name: 'approvedNotStartedDays', label: 'To do, not started' },
  { name: 'inProgressDays', label: 'Printing for too long' },
  { name: 'blockedDays', label: 'Waiting for filament or a fix' },
  { name: 'printedDays', label: 'Ready, not delivered' },
] as const;

type ThresholdName = (typeof THRESHOLDS)[number]['name'];
interface RemindersForm {
  reminders: { enabled: boolean } & Record<ThresholdName, string>;
  board: { completedRetentionDays: string };
}

const toForm = (s: CompanySettingsView): RemindersForm => ({
  reminders: {
    enabled: s.reminders.enabled,
    quoteWaitingDays: String(s.reminders.quoteWaitingDays),
    approvedNotStartedDays: String(s.reminders.approvedNotStartedDays),
    inProgressDays: String(s.reminders.inProgressDays),
    blockedDays: String(s.reminders.blockedDays),
    printedDays: String(s.reminders.printedDays),
  },
  board: { completedRetentionDays: String(s.board.completedRetentionDays) },
});

export function RemindersPage() {
  const { data: settings } = useSettings();
  if (!settings) return <PageLoader />;
  return <RemindersForm settings={settings} />;
}

function RemindersForm({ settings }: { settings: CompanySettingsView }) {
  const canManage = useCan('settings:manage');
  const save = useSaveSettings('Reminders saved');
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<RemindersForm>({
    resolver: formResolver(formSchema),
    defaultValues: toForm(settings),
  });
  const { prompt: guard } = useUnsavedChangesGuard(isDirty);
  useEffect(() => reset(toForm(settings)), [settings, reset]);
  const enabled = useWatch({ control, name: 'reminders.enabled' });

  const onSubmit = handleSubmit(async (values) => {
    const days = (v: string) => Number(v);
    try {
      await save.mutateAsync({
        reminders: {
          enabled: values.reminders.enabled,
          quoteWaitingDays: days(values.reminders.quoteWaitingDays),
          approvedNotStartedDays: days(values.reminders.approvedNotStartedDays),
          inProgressDays: days(values.reminders.inProgressDays),
          blockedDays: days(values.reminders.blockedDays),
          printedDays: days(values.reminders.printedDays),
        },
        board: { completedRetentionDays: days(values.board.completedRetentionDays) },
      });
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {guard}
      <fieldset disabled={!canManage} className="flex flex-col gap-5">
        <Panel
          title="Reminders"
          description="Notices on the dashboard when a job or quote sits still for too long. No messages are sent to customers."
        >
          <Controller
            control={control}
            name="reminders.enabled"
            render={({ field }) => (
              <SwitchField
                label="Show reminders"
                description="Opening a card or fixing a typo does not reset the timer."
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={!canManage}
              />
            )}
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {THRESHOLDS.map((t) => (
              <TextField
                key={t.name}
                label={t.label}
                inputMode="numeric"
                mono
                suffix="days"
                disabled={!enabled || !canManage}
                error={errors.reminders?.[t.name]?.message}
                {...register(`reminders.${t.name}`)}
              />
            ))}
          </div>
        </Panel>
        <Panel
          title="Finished cards"
          description="How long a finished card stays on the active board before it moves to the archive. It is never deleted."
        >
          <TextField
            label="Keep on the board for"
            inputMode="numeric"
            mono
            suffix="days"
            className="max-w-xs"
            hint="Sales count from when they are both completed and paid; gifts and personal prints from completion."
            error={errors.board?.completedRetentionDays?.message}
            {...register('board.completedRetentionDays')}
          />
        </Panel>
      </fieldset>
      {errors.root?.server && (
        <Notice tone="attention" title="Not saved">
          {errors.root.server.message}
        </Notice>
      )}
      {canManage && (
        <div className="flex gap-3">
          <Button type="submit" loading={save.isPending} disabled={!isDirty}>
            Save
          </Button>
          <Button variant="ghost" disabled={!isDirty} onClick={() => reset(toForm(settings))}>
            Cancel
          </Button>
        </div>
      )}
    </form>
  );
}
