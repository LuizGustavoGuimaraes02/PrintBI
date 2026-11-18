import { createItemSchema, type InventoryItemView } from '@printbi/shared';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import {
  Button,
  Notice,
  PageHeader,
  PageLoader,
  Panel,
  SwitchField,
  useToast,
} from '../../design-system';
import { api } from '../../lib/api';
import { applyMappedServerErrors, checkPayload } from '../../lib/forms';
import { unitLabel } from '../../lib/quantity';
import { useIdempotencyKey } from '../../lib/useIdempotencyKey';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { useCan } from '../auth/account';
import { useCategories, useSettings } from '../settings/queries';
import {
  defaultExpenseCategory,
  emptyItem,
  emptyLot,
  formPath,
  toItemPayload,
  toLotPayload,
} from './forms';
import { ItemFields, type InventoryForm } from './ItemFields';
import { LotFields } from './LotFields';
import { useFilamentProducts, useRefreshInventory } from './queries';

export function NewItemPage() {
  const { data: settings } = useSettings();
  const { data: categories } = useCategories();
  const { data: products } = useFilamentProducts();
  if (!settings || !categories || !products) return <PageLoader />;
  return (
    <NewItemForm
      currency={settings.currency.defaultCurrency}
      categories={categories}
      products={products}
    />
  );
}

type Props = {
  currency: 'CAD' | 'BRL';
  categories: NonNullable<ReturnType<typeof useCategories>['data']>;
  products: NonNullable<ReturnType<typeof useFilamentProducts>['data']>;
};

function NewItemForm({ currency, categories, products }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const refresh = useRefreshInventory();
  const canSeeFinance = useCan('finance:view');
  const canManageFinance = useCan('finance:manage');
  const idempotency = useIdempotencyKey();

  const defaults = (): InventoryForm => ({
    item: emptyItem('filament'),
    hasStock: true,
    lot: emptyLot(currency, defaultExpenseCategory(categories, 'filament')),
  });
  const form = useForm<InventoryForm>({ defaultValues: defaults() });
  const { control, handleSubmit, setError, reset, setValue, formState } = form;
  const kind = useWatch({ control, name: 'item.kind' });
  const hasStock = useWatch({ control, name: 'hasStock' });
  const unit = useWatch({ control, name: 'item.unit' });
  const customUnit = useWatch({ control, name: 'item.customUnit' });
  const { prompt: guard, allowLeave } = useUnsavedChangesGuard(formState.isDirty);

  // Each kind of purchase has its usual expense category.
  useEffect(() => {
    setValue('lot.expenseCategoryId', defaultExpenseCategory(categories, kind));
  }, [kind, categories, setValue]);

  const submit = (addAnother: boolean) =>
    handleSubmit(async (values) => {
      const payload = {
        item: toItemPayload(values.item),
        firstLot: values.hasStock
          ? toLotPayload(values.lot, { withCosts: canSeeFinance, withExpense: canManageFinance })
          : null,
      };
      if (!checkPayload(createItemSchema, payload, setError, (p) => formPath(p))) return;
      try {
        const item = await api.post<InventoryItemView>('/inventory/items', payload, {
          headers: idempotency.headers,
        });
        idempotency.renew();
        await refresh();
        toast.success('Item added', item.name);
        if (addAnother) reset({ ...defaults(), item: emptyItem(values.item.kind) });
        else {
          allowLeave();
          void navigate(`/inventory/${item.id}`);
        }
      } catch (error) {
        applyMappedServerErrors(error, setError, (p) => formPath(p));
      }
    });

  const unitText = kind === 'filament' ? 'g' : unitLabel({ unit, customUnit });

  return (
    <>
      {guard}
      <PageHeader
        eyebrow="Inventory"
        title="New item"
        description="Filament or anything else your prints consume."
      />
      <form onSubmit={(e) => void submit(false)(e)} noValidate className="flex flex-col gap-5">
        <Panel title="What it is">
          <ItemFields form={form} products={products} />
        </Panel>
        <Panel
          title={kind === 'filament' ? 'First roll' : 'Stock on hand'}
          description="Each roll or purchase is tracked separately, with its own price."
        >
          <SwitchField
            label={kind === 'filament' ? 'I have a roll of it now' : 'I have some of it now'}
            description="Turn off to register the item only and add stock later."
            checked={hasStock}
            onCheckedChange={(checked) => setValue('hasStock', checked, { shouldDirty: true })}
          />
          {hasStock && (
            <LotFields
              form={form}
              kind={kind}
              unit={unitText}
              canSeeFinance={canSeeFinance}
              canManageFinance={canManageFinance}
              categories={categories}
            />
          )}
        </Panel>
        {formState.errors.root?.server && (
          <Notice tone="attention" title="Not saved">
            {formState.errors.root.server.message}
          </Notice>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={formState.isSubmitting}>
            Save
          </Button>
          <Button
            variant="soft"
            loading={formState.isSubmitting}
            onClick={() => void submit(true)()}
          >
            Save &amp; add another
          </Button>
          <Button variant="ghost" onClick={() => void navigate('/inventory')}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
