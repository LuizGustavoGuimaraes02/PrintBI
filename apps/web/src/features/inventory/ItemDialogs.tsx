import {
  adjustLotSchema,
  itemInputSchema,
  lotInputSchema,
  reverseMovementSchema,
  updateLotSchema,
  type InventoryItemView,
  type InventoryLotView,
  type StockMovementView,
} from '@printbi/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Button,
  Modal,
  Notice,
  SelectField,
  TextAreaField,
  TextField,
  useToast,
} from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { applyMappedServerErrors, checkPayload } from '../../lib/forms';
import { toField } from '../../lib/money';
import { quantityField, showQuantity, unitLabel } from '../../lib/quantity';
import { useIdempotencyKey } from '../../lib/useIdempotencyKey';
import { useCan } from '../auth/account';
import { useCategories, useSettings } from '../settings/queries';
import {
  defaultExpenseCategory,
  emptyItem,
  emptyLot,
  formPath,
  itemToForm,
  toItemPayload,
  toLotPayload,
} from './forms';
import { ItemFields, type InventoryForm } from './ItemFields';
import { LotFields } from './LotFields';
import { useFilamentProducts, useRefreshInventory } from './queries';

interface ItemDialogProps {
  item: InventoryItemView;
  onClose: () => void;
}

export function AddLotDialog({ item, onClose }: ItemDialogProps) {
  const toast = useToast();
  const refresh = useRefreshInventory();
  const canManageFinance = useCan('finance:manage');
  const idempotency = useIdempotencyKey();
  const { data: settings } = useSettings();
  const { data: categories = [] } = useCategories();
  const form = useForm<InventoryForm>({
    defaultValues: {
      item: emptyItem(item.kind),
      hasStock: true,
      lot: {
        ...emptyLot(
          settings?.currency.defaultCurrency ?? 'CAD',
          defaultExpenseCategory(categories, item.kind),
        ),
        originalQuantity: item.kind === 'filament' ? '1000' : '',
      },
    },
  });
  const { handleSubmit, setError, formState } = form;

  const submit = handleSubmit(async (values) => {
    const payload = toLotPayload(values.lot, {
      withCosts: true,
      withExpense: canManageFinance,
    });
    const toFormPath = (p: string) => formPath(`lot.${p}`, 'lot');
    if (!checkPayload(lotInputSchema, payload, setError, toFormPath)) return;
    try {
      await api.post(`/inventory/items/${item.id}/lots`, payload, { headers: idempotency.headers });
      idempotency.renew();
      await refresh();
      toast.success(item.kind === 'filament' ? 'Roll added' : 'Stock added', item.name);
      onClose();
    } catch (error) {
      applyMappedServerErrors(error, setError, toFormPath);
    }
  });

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={item.kind === 'filament' ? `Add a roll of ${item.name}` : `Add stock of ${item.name}`}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={formState.isSubmitting} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
        <LotFields
          form={form}
          kind={item.kind}
          unit={unitLabel(item)}
          canManageFinance={canManageFinance}
          categories={categories}
        />
        {formState.errors.root?.server && (
          <Notice tone="attention" title="Not saved">
            {formState.errors.root.server.message}
          </Notice>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

export function EditItemDialog({ item, onClose }: ItemDialogProps) {
  const toast = useToast();
  const refresh = useRefreshInventory();
  const { data: products = [] } = useFilamentProducts();
  const form = useForm<InventoryForm>({
    defaultValues: { item: itemToForm(item), hasStock: false, lot: emptyLot('CAD') },
  });
  const { handleSubmit, setError, formState } = form;

  const submit = handleSubmit(async (values) => {
    const payload = toItemPayload(values.item);
    const toFormPath = (p: string) => formPath(`item.${p}`);
    if (!checkPayload(itemInputSchema, payload, setError, toFormPath)) return;
    try {
      await api.put(`/inventory/items/${item.id}`, payload);
      await refresh();
      toast.success('Item saved', values.item.name);
      onClose();
    } catch (error) {
      applyMappedServerErrors(error, setError, toFormPath);
    }
  });

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${item.name}`}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={formState.isSubmitting} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
        <ItemFields form={form} products={products} />
        {formState.errors.root?.server && (
          <Notice tone="attention" title="Not saved">
            {formState.errors.root.server.message}
          </Notice>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

interface LotDialogProps extends ItemDialogProps {
  lot: InventoryLotView;
}

/** Weighed a spool or counted the screws: set the real quantity, the difference is recorded. */
export function AdjustDialog({ item, lot, onClose }: LotDialogProps) {
  const toast = useToast();
  const refresh = useRefreshInventory();
  const idempotency = useIdempotencyKey();
  const [counted, setCounted] = useState(quantityField(lot.remaining));
  const [reason, setReason] = useState(item.kind === 'filament' ? 'Weighed the spool' : 'Counted');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const payload = { countedQuantity: counted, reason };
    const parsed = adjustLotSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the values');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/inventory/items/${item.id}/lots/${lot.id}/adjust`, payload, {
        headers: idempotency.headers,
      });
      idempotency.renew();
      await refresh();
      toast.success(
        'Quantity corrected',
        `${lot.label} · now ${showQuantity(parsed.data.countedQuantity, item)}`,
      );
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.details?.[0]?.message ?? e.message)
          : 'Could not reach the server.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Correct ${lot.label}`}
      description={`Recorded now: ${showQuantity(lot.remaining, item)}. Enter what is really there.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            Save correction
          </Button>
        </>
      }
    >
      <TextField
        label="Real quantity"
        inputMode="decimal"
        mono
        suffix={unitLabel(item)}
        value={counted}
        onChange={(e) => setCounted(e.target.value)}
      />
      <TextField
        label="Reason"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && (
        <Notice tone="attention" title="Not saved">
          {error}
        </Notice>
      )}
    </Modal>
  );
}

/** Undoes a wrong entry by recording its exact opposite. The original stays visible. */
export function ReverseDialog({
  item,
  movement,
  onClose,
}: ItemDialogProps & { movement: StockMovementView }) {
  const toast = useToast();
  const refresh = useRefreshInventory();
  const idempotency = useIdempotencyKey();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reverseMovementSchema.safeParse({ reason }).success) {
      setError('Explain the correction');
      return;
    }
    setSaving(true);
    try {
      await api.post(
        `/inventory/movements/${movement.id}/reverse`,
        { reason },
        { headers: idempotency.headers },
      );
      idempotency.renew();
      await refresh();
      toast.success(
        'Entry corrected',
        `${movement.lotLabel} · ${movement.delta > 0 ? '−' : '+'}${showQuantity(Math.abs(movement.delta), item)}`,
      );
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Correct this entry"
      description={`Records the opposite of ${movement.delta > 0 ? '+' : '−'}${showQuantity(Math.abs(movement.delta), item)} on ${movement.lotLabel}. Both stay in the history. To fix the amount, record the right one afterwards.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            Record correction
          </Button>
        </>
      }
    >
      <TextField
        label="Reason"
        required
        placeholder="e.g. entered 200 g, used 120 g"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && (
        <Notice tone="attention" title="Not corrected">
          {error}
        </Notice>
      )}
    </Modal>
  );
}

interface LotDetailsForm {
  label: string;
  store: string;
  notes: string;
  purchasedAt: string;
  price: string;
  currency: 'CAD' | 'BRL';
  lowStockThreshold: string;
}

/** Label, store and notes; the price only while nothing was taken from the lot yet. */
export function LotDetailsDialog({ item, lot, onClose }: LotDialogProps) {
  const toast = useToast();
  const refresh = useRefreshInventory();
  const canSeeFinance = useCan('finance:view');
  const priceEditable = canSeeFinance && !lot.used;
  const { register, handleSubmit, setError, formState } = useForm<LotDetailsForm>({
    defaultValues: {
      label: lot.label,
      store: lot.store,
      notes: lot.notes,
      purchasedAt: lot.purchasedAt?.slice(0, 10) ?? '',
      price: toField(lot.totalCost?.amount),
      currency: lot.totalCost?.currency ?? 'CAD',
      lowStockThreshold:
        lot.lowStockThreshold === null ? '' : String(lot.lowStockThreshold / 1_000_000),
    },
  });
  const filament = item.kind === 'filament';

  const submit = handleSubmit(async (v) => {
    const payload = {
      label: v.label,
      store: v.store,
      notes: v.notes,
      purchasedAt: v.purchasedAt || null,
      ...(filament && { lowStockThreshold: v.lowStockThreshold.trim() || null }),
      ...(priceEditable && {
        totalCost: v.price.trim() ? { amount: v.price.trim(), currency: v.currency } : null,
      }),
    };
    const toFormPath = (p: string) => (p.startsWith('totalCost') ? 'price' : p);
    if (!checkPayload(updateLotSchema, payload, setError, toFormPath)) return;
    try {
      await api.patch(`/inventory/items/${item.id}/lots/${lot.id}`, payload);
      await refresh();
      toast.success('Lot saved', v.label);
      onClose();
    } catch (error) {
      applyMappedServerErrors(error, setError, toFormPath);
    }
  });

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${lot.label}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={formState.isSubmitting} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Label"
          required
          error={formState.errors.label?.message}
          {...register('label')}
        />
        <TextField label="Bought on" type="date" {...register('purchasedAt')} />
        <TextField label="Store" className="sm:col-span-2" {...register('store')} />
        {canSeeFinance && (
          <>
            <TextField
              label="Price paid"
              inputMode="decimal"
              mono
              disabled={!priceEditable}
              hint={lot.used ? 'Locked: stock was already taken at this price.' : undefined}
              error={formState.errors.price?.message}
              {...register('price')}
            />
            <SelectField label="Currency" disabled={!priceEditable} {...register('currency')}>
              <option value="CAD">CAD</option>
              <option value="BRL">BRL</option>
            </SelectField>
          </>
        )}
        {filament && (
          <TextField
            label="Warn when this roll drops below"
            inputMode="decimal"
            mono
            suffix="g"
            className="sm:col-span-2"
            placeholder={
              lot.effectiveLowStockThreshold !== null && lot.lowStockThreshold === null
                ? `${lot.effectiveLowStockThreshold / 1_000_000} (default)`
                : 'Default'
            }
            hint="Leave empty to follow the default set for every roll in Settings."
            error={formState.errors.lowStockThreshold?.message}
            {...register('lowStockThreshold')}
          />
        )}
        <TextAreaField label="Notes" rows={2} className="sm:col-span-2" {...register('notes')} />
        {formState.errors.root?.server && (
          <div className="sm:col-span-2">
            <Notice tone="attention" title="Not saved">
              {formState.errors.root.server.message}
            </Notice>
          </div>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
