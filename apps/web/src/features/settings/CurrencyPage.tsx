import {
  currencySettingsSchema,
  formatMoney,
  multiply,
  toMicro,
  type CompanySettingsView,
} from '@printbi/shared';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button, Notice, PageLoader, Panel, SelectField, TextField } from '../../design-system';
import { toField } from '../../lib/money';
import { applyServerErrors, formResolver } from '../../lib/forms';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { useCan } from '../auth/account';
import { useSettings } from './queries';
import { emptyToNull, useSaveSettings } from './useSettingsSection';

const formSchema = currencySettingsSchema.extend({
  brlPerCad: z.preprocess(emptyToNull, currencySettingsSchema.shape.brlPerCad),
});
type CurrencyForm = { defaultCurrency: 'CAD' | 'BRL'; brlPerCad: string };

const toForm = (s: CompanySettingsView): CurrencyForm => ({
  defaultCurrency: s.currency.defaultCurrency,
  brlPerCad: toField(s.currency.brlPerCad),
});

const dateTime = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' });

export function CurrencyPage() {
  const { data: settings } = useSettings();
  if (!settings) return <PageLoader />;
  return <CurrencyForm settings={settings} />;
}

function CurrencyForm({ settings }: { settings: CompanySettingsView }) {
  const canManage = useCan('settings:manage');
  const save = useSaveSettings('Currency saved');
  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors, isDirty },
  } = useForm<CurrencyForm>({
    resolver: formResolver(formSchema),
    defaultValues: toForm(settings),
  });
  const guard = useUnsavedChangesGuard(isDirty);
  useEffect(() => reset(toForm(settings)), [settings, reset]);

  const rate = useWatch({ control, name: 'brlPerCad' });
  let example: string | null = null;
  try {
    if (rate)
      example = formatMoney({ amount: multiply(toMicro('100'), toMicro(rate)), currency: 'BRL' });
  } catch {
    example = null;
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await save.mutateAsync({
        currency: { defaultCurrency: values.defaultCurrency, brlPerCad: values.brlPerCad || null },
      });
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  return (
    <Panel
      title="Currency"
      description="New records start in the default currency. Every record keeps its original amount and currency forever."
    >
      {guard}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <fieldset disabled={!canManage} className="grid gap-5 md:grid-cols-2">
          <SelectField
            label="Default currency"
            error={errors.defaultCurrency?.message}
            {...register('defaultCurrency')}
          >
            <option value="CAD">CAD · Canadian dollar</option>
            <option value="BRL">BRL · Brazilian real</option>
          </SelectField>
          <TextField
            label="Display rate · BRL per 1 CAD"
            inputMode="decimal"
            mono
            placeholder="e.g. 4.05"
            hint={
              example
                ? `CAD 100.00 shows as about ${example}`
                : 'Optional. Used only to compare values in reports.'
            }
            error={errors.brlPerCad?.message}
            {...register('brlPerCad')}
          />
        </fieldset>
        <Notice title="How conversion works">
          Converted values in reports are approximate and always show the rate used. Original
          amounts are never overwritten, and each sale keeps the rate it was recorded with.
          {settings.currency.rateUpdatedAt && (
            <span className="figure mt-1 block text-[13px] text-ink-muted">
              Rate last changed {dateTime.format(new Date(settings.currency.rateUpdatedAt))}
            </span>
          )}
        </Notice>
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
    </Panel>
  );
}
