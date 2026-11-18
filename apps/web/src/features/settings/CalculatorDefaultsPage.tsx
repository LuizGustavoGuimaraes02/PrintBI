import { calculatorDefaultsSchema, type CompanySettingsView } from '@printbi/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  Notice,
  PageLoader,
  Panel,
  SelectField,
  TextAreaField,
  TextField,
} from '../../design-system';
import { applyServerErrors, formResolver } from '../../lib/forms';
import { toField } from '../../lib/money';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { useCan } from '../auth/account';
import { useSettings } from './queries';
import { emptyToNull, useSaveSettings } from './useSettingsSection';

const formSchema = calculatorDefaultsSchema.extend({
  targetMarginPercent: z.preprocess(
    emptyToNull,
    calculatorDefaultsSchema.shape.targetMarginPercent,
  ),
});

interface CalculatorForm {
  energyPricePerKwh: { amount: string; currency: 'CAD' | 'BRL' };
  laborRatePerHour: { amount: string; currency: 'CAD' | 'BRL' };
  targetMarginPercent: string;
  riskPercent: string;
  riskBase: 'filament' | 'materials' | 'total';
  quoteValidityDays: string;
  paymentTerms: string;
}

const toForm = ({ calculator: c }: CompanySettingsView): CalculatorForm => ({
  energyPricePerKwh: {
    amount: toField(c.energyPricePerKwh.amount),
    currency: c.energyPricePerKwh.currency,
  },
  laborRatePerHour: {
    amount: toField(c.laborRatePerHour.amount),
    currency: c.laborRatePerHour.currency,
  },
  targetMarginPercent: toField(c.targetMarginPercent),
  riskPercent: toField(c.riskPercent),
  riskBase: c.riskBase,
  quoteValidityDays: String(c.quoteValidityDays),
  paymentTerms: c.paymentTerms,
});

export function CalculatorDefaultsPage() {
  const { data: settings } = useSettings();
  if (!settings) return <PageLoader />;
  return <CalculatorForm settings={settings} />;
}

function CalculatorForm({ settings }: { settings: CompanySettingsView }) {
  const canManage = useCan('settings:manage');
  const save = useSaveSettings('Calculator defaults saved');
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<CalculatorForm>({
    resolver: formResolver(formSchema),
    defaultValues: toForm(settings),
  });
  const guard = useUnsavedChangesGuard(isDirty);
  useEffect(() => reset(toForm(settings)), [settings, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await save.mutateAsync({
        calculator: {
          ...values,
          targetMarginPercent: values.targetMarginPercent || null,
          quoteValidityDays: Number(values.quoteValidityDays),
        },
      });
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  return (
    <Panel
      title="Calculator defaults"
      description="Starting values for every new calculation. Each one can still be changed per calculation."
    >
      {guard}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <fieldset disabled={!canManage} className="grid gap-5 md:grid-cols-2">
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <TextField
              label="Energy price per kWh"
              inputMode="decimal"
              mono
              error={errors.energyPricePerKwh?.amount?.message}
              {...register('energyPricePerKwh.amount')}
            />
            <SelectField label="Currency" {...register('energyPricePerKwh.currency')}>
              <option value="CAD">CAD</option>
              <option value="BRL">BRL</option>
            </SelectField>
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <TextField
              label="Labor rate per hour"
              inputMode="decimal"
              mono
              error={errors.laborRatePerHour?.amount?.message}
              {...register('laborRatePerHour.amount')}
            />
            <SelectField label="Currency" {...register('laborRatePerHour.currency')}>
              <option value="CAD">CAD</option>
              <option value="BRL">BRL</option>
            </SelectField>
          </div>
          <TextField
            label="Target margin on sale price"
            inputMode="decimal"
            mono
            suffix="%"
            hint="Optional. Margin is profit as a share of the price; it must stay below 100%."
            error={errors.targetMarginPercent?.message}
            {...register('targetMarginPercent')}
          />
          <TextField
            label="Quote validity"
            inputMode="numeric"
            mono
            suffix="days"
            error={errors.quoteValidityDays?.message}
            {...register('quoteValidityDays')}
          />
          <TextField
            label="Risk and waste allowance"
            inputMode="decimal"
            mono
            suffix="%"
            hint="An estimate for failed prints and waste."
            error={errors.riskPercent?.message}
            {...register('riskPercent')}
          />
          <SelectField
            label="Apply the allowance to"
            error={errors.riskBase?.message}
            {...register('riskBase')}
          >
            <option value="filament">Filament only</option>
            <option value="materials">All materials</option>
            <option value="total">Total cost</option>
          </SelectField>
          <TextAreaField
            label="Default payment terms"
            className="md:col-span-2"
            rows={3}
            placeholder="e.g. 50% upfront, the rest on delivery"
            error={errors.paymentTerms?.message}
            {...register('paymentTerms')}
          />
        </fieldset>
        <Notice title="Margin is not markup">
          A 40% margin on a CAD 60 cost means a CAD 100 price (profit is 40% of the price). A 40%
          markup means CAD 84 (profit is 40% of the cost).
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
