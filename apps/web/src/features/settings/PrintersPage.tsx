import {
  machineRatePerHour,
  printerInputSchema,
  toMicro,
  type Currency,
  type Money,
  type PrinterModelView,
  type PrinterView,
} from '@printbi/shared';
import { FileText, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch, type Path } from 'react-hook-form';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Modal,
  Notice,
  PageLoader,
  Panel,
  SelectField,
  TextAreaField,
  TextField,
} from '../../design-system';
import { ApiError, api } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import { showUnitMoney, toField } from '../../lib/money';
import { useCan } from '../auth/account';
import { PrinterModelPicker } from './PrinterModelPicker';
import { PrinterSpecSheet } from './PrinterSpecSheet';
import { companyBase, keys, usePrinterModels, usePrinters, useSaving } from './queries';

type CostMode = 'none' | 'direct' | 'recovery';

interface PrinterForm {
  modelId: string;
  name: string;
  brand: string;
  model: string;
  purchasedAt: string;
  powerWatts: string;
  status: PrinterView['status'];
  notes: string;
  currency: Currency;
  purchaseAmount: string;
  costMode: CostMode;
  directAmount: string;
  years: string;
  hoursPerDay: string;
  daysPerYear: string;
  maintenanceKind: 'amount' | 'percent';
  maintenanceValue: string;
}

const EMPTY: PrinterForm = {
  modelId: '',
  name: '',
  brand: '',
  model: '',
  purchasedAt: '',
  powerWatts: '',
  status: 'active',
  notes: '',
  currency: 'CAD',
  purchaseAmount: '',
  costMode: 'recovery',
  directAmount: '',
  years: '2',
  hoursPerDay: '8',
  daysPerYear: '300',
  maintenanceKind: 'percent',
  maintenanceValue: '20',
};

function toForm(p: PrinterView): PrinterForm {
  const r = p.recovery;
  return {
    modelId: p.modelId ?? '',
    name: p.name,
    brand: p.brand,
    model: p.model,
    purchasedAt: p.purchasedAt?.slice(0, 10) ?? '',
    powerWatts: p.powerWatts?.toString() ?? '',
    status: p.status,
    notes: p.notes,
    currency: p.purchaseCost?.currency ?? p.costPerHour?.currency ?? 'CAD',
    purchaseAmount: toField(p.purchaseCost?.amount),
    costMode: p.costPerHour ? 'direct' : r ? 'recovery' : 'none',
    directAmount: toField(p.costPerHour?.amount),
    years: r ? toField(r.years) : EMPTY.years,
    hoursPerDay: r ? toField(r.hoursPerDay) : EMPTY.hoursPerDay,
    daysPerYear: r ? toField(r.daysPerYear) : EMPTY.daysPerYear,
    maintenanceKind: r?.maintenance.kind ?? 'percent',
    maintenanceValue: r
      ? toField(r.maintenance.kind === 'amount' ? r.maintenance.amount : r.maintenance.percent)
      : EMPTY.maintenanceValue,
  };
}

function toPayload(f: PrinterForm) {
  const money = (amount: string) =>
    amount.trim() ? { amount: amount.trim(), currency: f.currency } : null;
  return {
    modelId: f.modelId || null,
    name: f.name,
    brand: f.brand,
    model: f.model,
    purchasedAt: f.purchasedAt || null,
    powerWatts: f.powerWatts.trim() ? Number(f.powerWatts) : null,
    status: f.status,
    notes: f.notes,
    purchaseCost: money(f.purchaseAmount),
    costPerHour: f.costMode === 'direct' ? money(f.directAmount) : null,
    recovery:
      f.costMode === 'recovery'
        ? {
            years: f.years,
            hoursPerDay: f.hoursPerDay,
            daysPerYear: f.daysPerYear,
            maintenance:
              f.maintenanceKind === 'amount'
                ? { kind: 'amount' as const, amount: f.maintenanceValue || '0' }
                : { kind: 'percent' as const, percent: f.maintenanceValue || '0' },
          }
        : null,
  };
}

/** Payload paths → form fields, so shared-schema and server errors land on the right input. */
const FIELD_FOR_PATH: Record<string, Path<PrinterForm>> = {
  'purchaseCost.amount': 'purchaseAmount',
  'costPerHour.amount': 'directAmount',
  'recovery.years': 'years',
  'recovery.hoursPerDay': 'hoursPerDay',
  'recovery.daysPerYear': 'daysPerYear',
  'recovery.maintenance.amount': 'maintenanceValue',
  'recovery.maintenance.percent': 'maintenanceValue',
};
const fieldFor = (path: string) => FIELD_FOR_PATH[path] ?? (path as Path<PrinterForm>);

/** Live machine-rate preview from the shared formula; null while inputs are incomplete. */
function previewRate(f: PrinterForm): Money | null {
  try {
    if (f.costMode === 'direct')
      return f.directAmount ? { amount: toMicro(f.directAmount), currency: f.currency } : null;
    if (f.costMode !== 'recovery' || !f.purchaseAmount) return null;
    const value = toMicro(f.maintenanceValue || '0');
    const rate = machineRatePerHour({
      purchase: toMicro(f.purchaseAmount),
      years: toMicro(f.years),
      daysPerYear: toMicro(f.daysPerYear),
      hoursPerDay: toMicro(f.hoursPerDay),
      maintenance:
        f.maintenanceKind === 'amount'
          ? { kind: 'amount', amount: value }
          : { kind: 'percent', percent: value },
    });
    return rate === null ? null : { amount: rate, currency: f.currency };
  } catch {
    return null;
  }
}

function rateOf(p: PrinterView): Money | null {
  if (p.costPerHour) return p.costPerHour;
  if (!p.recovery || !p.purchaseCost) return null;
  const rate = machineRatePerHour({ purchase: p.purchaseCost.amount, ...p.recovery });
  return rate === null ? null : { amount: rate, currency: p.purchaseCost.currency };
}

const STATUS_LABEL: Record<PrinterView['status'], string> = {
  active: 'Active',
  maintenance: 'In maintenance',
  retired: 'Retired',
};

export function PrintersPage() {
  const { data: printers } = usePrinters();
  const { data: models = [] } = usePrinterModels();
  const modelsById = new Map(models.map((m) => [m.id, m]));
  const [specFor, setSpecFor] = useState<PrinterView | null>(null);
  const canManage = useCan('settings:manage');
  const canSeeFinance = useCan('finance:view');
  const [editing, setEditing] = useState<PrinterView | 'new' | null>(null);
  const [archiving, setArchiving] = useState<PrinterView | null>(null);
  const archive = useSaving(
    (id: string) => api.delete(`${companyBase}/printers/${id}`),
    [keys.printers],
    'Printer archived',
  );

  if (!printers) return <PageLoader />;

  return (
    <Panel
      title="Printers"
      description="Assign jobs to a printer and price machine time. Archived printers stay on past orders."
      actions={
        canManage && (
          <Button
            size="sm"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => setEditing('new')}
          >
            Add printer
          </Button>
        )
      }
    >
      {printers.length === 0 ? (
        <EmptyState
          title="No printers yet"
          action={
            canManage && <Button onClick={() => setEditing('new')}>Add your first printer</Button>
          }
        >
          Register each machine to assign print jobs and include machine time in your prices.
        </EmptyState>
      ) : (
        <ul className="flex flex-col">
          {printers.map((printer) => {
            const rate = rateOf(printer);
            return (
              <li
                key={printer.id}
                className="grid gap-3 border-t border-rule-soft py-4 first:border-t-0 first:pt-0 md:grid-cols-[1fr_auto_auto_auto] md:items-center md:gap-6"
              >
                <div className="flex flex-col">
                  <span className="font-bold">{printer.name}</span>
                  <span className="figure text-[13px] text-ink-muted">
                    {[printer.brand, printer.model].filter(Boolean).join(' · ') ||
                      'No brand or model'}
                    {printer.powerWatts !== null && ` · ${printer.powerWatts} W`}
                  </span>
                </div>
                <Badge
                  tone={
                    printer.status === 'active'
                      ? 'teal'
                      : printer.status === 'maintenance'
                        ? 'hot'
                        : 'neutral'
                  }
                >
                  {STATUS_LABEL[printer.status]}
                </Badge>
                {canSeeFinance && (
                  <span className="figure text-[15px]">
                    {rate ? `${showUnitMoney(rate)} / h` : 'No machine cost'}
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  {printer.modelId && modelsById.has(printer.modelId) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<FileText size={16} aria-hidden="true" />}
                      onClick={() => setSpecFor(printer)}
                    >
                      Spec sheet
                    </Button>
                  )}
                  {canManage && (
                    <>
                      <Button size="sm" variant="soft" onClick={() => setEditing(printer)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setArchiving(printer)}>
                        Archive
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <PrinterDialog
          printer={editing === 'new' ? null : editing}
          models={models}
          onClose={() => setEditing(null)}
        />
      )}
      {specFor?.modelId && modelsById.get(specFor.modelId) && (
        <PrinterSpecSheet
          printer={specFor}
          model={modelsById.get(specFor.modelId) as PrinterModelView}
          onClose={() => setSpecFor(null)}
        />
      )}
      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={`Archive ${archiving?.name ?? ''}?`}
        description="It disappears from new jobs and calculations. Past orders keep showing it."
        confirmLabel="Archive printer"
        loading={archive.isPending}
        onConfirm={() =>
          archiving && archive.mutate(archiving.id, { onSettled: () => setArchiving(null) })
        }
      />
    </Panel>
  );
}

interface PrinterDialogProps {
  printer: PrinterView | null;
  models: PrinterModelView[];
  onClose: () => void;
}

function PrinterDialog({ printer, models, onClose }: PrinterDialogProps) {
  const save = useSaving(
    (payload: ReturnType<typeof toPayload>) =>
      printer
        ? api.put<PrinterView>(`${companyBase}/printers/${printer.id}`, payload)
        : api.post<PrinterView>(`${companyBase}/printers`, payload),
    [keys.printers],
    printer ? 'Printer saved' : 'Printer added',
  );
  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<PrinterForm>({ defaultValues: printer ? toForm(printer) : EMPTY });

  const values = useWatch({ control }) as PrinterForm;
  const rate = previewRate(values);
  const selectedModel = models.find((m) => m.id === values.modelId) ?? null;

  /** Picking a model fills the identity fields; the name is kept if the user already typed one. */
  const selectModel = (model: PrinterModelView | null) => {
    const dirty = { shouldDirty: true, shouldValidate: false };
    if (!model) {
      setValue('modelId', '', dirty);
      return;
    }
    const currentName = getValues('name').trim();
    if (!currentName || currentName === selectedModel?.fullName)
      setValue('name', model.fullName, dirty);
    setValue('modelId', model.id, dirty);
    setValue('brand', model.brand, dirty);
    setValue('model', model.model, dirty);
  };

  const submit = (addAnother: boolean) =>
    handleSubmit(async (form) => {
      const payload = toPayload(form);
      const checked = printerInputSchema.safeParse(payload);
      if (!checked.success) {
        for (const issue of checked.error.issues) {
          setError(fieldFor(issue.path.map(String).join('.')), { message: issue.message });
        }
        return;
      }
      try {
        await save.mutateAsync(payload);
        if (addAnother) reset(EMPTY);
        else onClose();
      } catch (error) {
        const fields = error instanceof ApiError ? Object.entries(error.fieldErrors()) : [];
        if (fields.length > 0)
          fields.forEach(([path, message]) => setError(fieldFor(path), { message }));
        else applyServerErrors(error, setError);
      }
    });

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={printer ? `Edit ${printer.name}` : 'Add printer'}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {!printer && (
            <Button variant="soft" loading={save.isPending} onClick={() => void submit(true)()}>
              Save &amp; add another
            </Button>
          )}
          <Button loading={save.isPending} onClick={() => void submit(false)()}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void submit(false)(e)} noValidate className="flex flex-col gap-6">
        <PrinterModelPicker models={models} selected={selectedModel} onSelect={selectModel} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Name"
            required
            className="sm:col-span-2"
            placeholder="e.g. Adventurer 5M"
            error={errors.name?.message}
            {...register('name')}
          />
          <TextField label="Brand" error={errors.brand?.message} {...register('brand')} />
          <TextField label="Model" error={errors.model?.message} {...register('model')} />
          <TextField
            label="Bought on"
            type="date"
            error={errors.purchasedAt?.message}
            {...register('purchasedAt')}
          />
          <TextField
            label="Average power"
            inputMode="numeric"
            mono
            suffix="W"
            hint={
              selectedModel?.ratedPowerW
                ? `Used for energy cost. The spec sheet rates it at ${selectedModel.ratedPowerW} W peak; the average while printing is much lower.`
                : 'An estimate used for energy cost.'
            }
            error={errors.powerWatts?.message}
            {...register('powerWatts')}
          />
          <SelectField label="Status" {...register('status')}>
            <option value="active">Active</option>
            <option value="maintenance">In maintenance</option>
            <option value="retired">Retired</option>
          </SelectField>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-5 rounded-[var(--radius-tile)] bg-bench p-5">
          <legend className="label-mono float-left mb-1 text-ink-muted">Machine cost</legend>
          <div className="grid gap-5 sm:grid-cols-[1fr_120px]">
            <TextField
              label="Purchase price"
              inputMode="decimal"
              mono
              error={errors.purchaseAmount?.message}
              {...register('purchaseAmount')}
            />
            <SelectField label="Currency" {...register('currency')}>
              <option value="CAD">CAD</option>
              <option value="BRL">BRL</option>
            </SelectField>
          </div>
          <SelectField label="How to price machine time" {...register('costMode')}>
            <option value="recovery">Recover the purchase over its working life</option>
            <option value="direct">Enter a cost per hour directly</option>
            <option value="none">Do not charge machine time</option>
          </SelectField>
          {values.costMode === 'direct' && (
            <TextField
              label="Cost per print hour"
              inputMode="decimal"
              mono
              error={errors.directAmount?.message}
              {...register('directAmount')}
            />
          )}
          {values.costMode === 'recovery' && (
            <div className="grid gap-5 sm:grid-cols-3">
              <TextField
                label="Pay back over"
                inputMode="decimal"
                mono
                suffix="years"
                error={errors.years?.message}
                {...register('years')}
              />
              <TextField
                label="Working hours a day"
                inputMode="decimal"
                mono
                suffix="h"
                error={errors.hoursPerDay?.message}
                {...register('hoursPerDay')}
              />
              <TextField
                label="Working days a year"
                inputMode="decimal"
                mono
                suffix="days"
                error={errors.daysPerYear?.message}
                {...register('daysPerYear')}
              />
              <SelectField label="Lifetime repairs as" {...register('maintenanceKind')}>
                <option value="percent">% of the price</option>
                <option value="amount">An amount</option>
              </SelectField>
              <TextField
                label="Lifetime repairs"
                inputMode="decimal"
                mono
                suffix={values.maintenanceKind === 'percent' ? '%' : values.currency}
                error={errors.maintenanceValue?.message}
                {...register('maintenanceValue')}
              />
            </div>
          )}
          {values.costMode !== 'none' && (
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-rule pt-4">
              <span className="label-mono text-ink-muted">Machine cost per print hour</span>
              <span className="figure text-[26px] font-medium">
                {rate ? showUnitMoney(rate) : '—'}
              </span>
            </div>
          )}
          <p className="text-[13px] text-ink-muted">
            A pricing estimate spread over the printer&apos;s working life, not a payment you make
            each hour.
          </p>
        </fieldset>

        <TextAreaField
          label="Notes"
          rows={3}
          error={errors.notes?.message}
          {...register('notes')}
        />
        {errors.root?.server && (
          <Notice tone="attention" title="Not saved">
            {errors.root.server.message}
          </Notice>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
