import {
  createItemSchema,
  ITEM_KINDS,
  type CategoryView,
  type Currency,
  type FilamentProductView,
  type InventoryItemView,
  type ItemKind,
} from '@printbi/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import {
  Button,
  cn,
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
import { FilamentPurchase } from './FilamentPurchase';
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

const KIND_LABEL: Record<ItemKind, string> = {
  filament: 'Filament',
  material: 'Material or part',
  packaging: 'Packaging',
  other: 'Other',
};

export function NewItemPage() {
  const { data: settings } = useSettings();
  const { data: categories } = useCategories();
  const { data: products } = useFilamentProducts();
  const [kind, setKind] = useState<ItemKind>('filament');
  if (!settings || !categories || !products) return <PageLoader />;
  const currency = settings.currency.defaultCurrency;

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title={kind === 'filament' ? 'Add filament' : 'New item'}
        description={
          kind === 'filament'
            ? 'Add every roll of an order at once: set one up, then duplicate it and change the color.'
            : 'Screws, magnets, boxes or anything else your prints consume.'
        }
      />
      <div role="group" aria-label="Type of item" className="flex flex-wrap gap-2 px-1">
        {ITEM_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              'h-11 rounded-full px-5 text-[15px] font-semibold',
              kind === k ? 'bg-ink text-white' : 'bg-surface text-ink hover:bg-bench',
            )}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {kind === 'filament' ? (
        <FilamentPurchase currency={currency} categories={categories} products={products} />
      ) : (
        <SingleItemForm
          key={kind}
          kind={kind}
          currency={currency}
          categories={categories}
          products={products}
        />
      )}
    </>
  );
}

interface SingleItemFormProps {
  kind: ItemKind;
  currency: Currency;
  categories: CategoryView[];
  products: FilamentProductView[];
}

/** One consumable with its first lot (screws, boxes, magnets...). */
function SingleItemForm({ kind, currency, categories, products }: SingleItemFormProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const refresh = useRefreshInventory();
  const canManageFinance = useCan('finance:manage');
  const idempotency = useIdempotencyKey();

  const defaults = (): InventoryForm => ({
    item: emptyItem(kind),
    hasStock: true,
    lot: { ...emptyLot(currency, defaultExpenseCategory(categories, kind)), originalQuantity: '' },
    rolls: '1',
  });
  const form = useForm<InventoryForm>({ defaultValues: defaults() });
  const { control, handleSubmit, setError, reset, setValue, formState } = form;
  const hasStock = useWatch({ control, name: 'hasStock' });
  const unit = useWatch({ control, name: 'item.unit' });
  const customUnit = useWatch({ control, name: 'item.customUnit' });
  const { prompt: guard, allowLeave } = useUnsavedChangesGuard(formState.isDirty);

  const submit = (addAnother: boolean) =>
    handleSubmit(async (values) => {
      const payload = {
        item: toItemPayload(values.item),
        firstLot: values.hasStock
          ? toLotPayload(values.lot, { withCosts: true, withExpense: canManageFinance })
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
        if (addAnother) reset(defaults());
        else {
          allowLeave();
          void navigate(`/inventory/${item.id}`);
        }
      } catch (error) {
        applyMappedServerErrors(error, setError, (p) => formPath(p));
      }
    });

  return (
    <form onSubmit={(e) => void submit(false)(e)} noValidate className="flex flex-col gap-5">
      {guard}
      <Panel title="What it is">
        <ItemFields form={form} products={products} />
      </Panel>
      <Panel
        title="Stock on hand"
        description="Each purchase is tracked separately, with its own price."
      >
        <SwitchField
          label="I have some of it now"
          description="Turn off to register the item only and add stock later."
          checked={hasStock}
          onCheckedChange={(checked) => setValue('hasStock', checked, { shouldDirty: true })}
        />
        {hasStock && (
          <LotFields
            form={form}
            kind={kind}
            unit={unitLabel({ unit, customUnit })}
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
        <Button variant="soft" loading={formState.isSubmitting} onClick={() => void submit(true)()}>
          Save &amp; add another
        </Button>
        <Button variant="ghost" onClick={() => void navigate('/inventory')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
