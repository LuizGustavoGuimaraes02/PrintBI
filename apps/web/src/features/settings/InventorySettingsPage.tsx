import { inventorySettingsSchema, type CompanySettingsView } from '@printbi/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Notice, PageLoader, Panel, TextField } from '../../design-system';
import { applyServerErrors, formResolver } from '../../lib/forms';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { useCan } from '../auth/account';
import { useSettings } from './queries';
import { useSaveSettings } from './useSettingsSection';

interface InventoryForm {
  rollLowStockThreshold: string;
}

const toForm = (s: CompanySettingsView): InventoryForm => ({
  rollLowStockThreshold: String(s.inventory.rollLowStockThreshold / 1_000_000),
});

export function InventorySettingsPage() {
  const { data: settings } = useSettings();
  if (!settings) return <PageLoader />;
  return <InventorySettingsForm settings={settings} />;
}

function InventorySettingsForm({ settings }: { settings: CompanySettingsView }) {
  const canManage = useCan('settings:manage');
  const save = useSaveSettings('Stock warnings saved');
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<InventoryForm>({
    resolver: formResolver(inventorySettingsSchema),
    defaultValues: toForm(settings),
  });
  const { prompt: guard } = useUnsavedChangesGuard(isDirty);
  useEffect(() => reset(toForm(settings)), [settings, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await save.mutateAsync({ inventory: values });
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  return (
    <Panel
      title="Stock warnings"
      description="Every filament roll warns when it runs low. Change the limit here to update all rolls at once."
    >
      {guard}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <fieldset disabled={!canManage} className="flex flex-col gap-5">
          <TextField
            label="Warn when a filament roll drops below"
            inputMode="decimal"
            mono
            suffix="g"
            className="max-w-sm"
            hint="A roll with its own limit keeps it; set it back to empty on the roll to follow this default."
            error={errors.rollLowStockThreshold?.message}
            {...register('rollLowStockThreshold')}
          />
        </fieldset>
        <Notice title="Other consumables">
          Screws, magnets, boxes and other items warn on their total, set on each item.
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
