import { divide, toMicro, type CategoryView, type ItemKind } from '@printbi/shared';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { SelectField, SwitchField, TextAreaField, TextField } from '../../design-system';
import { showUnitMoney } from '../../lib/money';
import type { InventoryForm } from './ItemFields';

interface LotFieldsProps {
  form: UseFormReturn<InventoryForm>;
  kind: ItemKind;
  unit: string;
  canSeeFinance: boolean;
  canManageFinance: boolean;
  categories: CategoryView[];
}

/** One physical roll or purchase lot: quantity, what is left, price and the optional expense. */
export function LotFields({
  form,
  kind,
  unit,
  canSeeFinance,
  canManageFinance,
  categories,
}: LotFieldsProps) {
  const { register, control, setValue, formState } = form;
  const errors = formState.errors.lot;
  const lot = useWatch({ control, name: 'lot' });
  const filament = kind === 'filament';

  let unitCost: string | null = null;
  try {
    if (lot.price && lot.originalQuantity) {
      const amount = divide(toMicro(lot.price), toMicro(lot.originalQuantity));
      unitCost = `${showUnitMoney({ amount, currency: lot.currency })} per ${filament ? 'gram' : unit === 'units' ? 'unit' : unit}`;
    }
  } catch {
    unitCost = null;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={filament ? 'Net filament weight' : 'Quantity bought'}
          required
          inputMode="decimal"
          mono
          suffix={unit}
          hint={filament ? 'The filament only, not the empty spool.' : undefined}
          error={errors?.originalQuantity?.message}
          {...register('lot.originalQuantity')}
        />
        <TextField
          label="Label"
          placeholder={filament ? 'Automatic, e.g. Roll 3' : 'Automatic, e.g. Lot 2'}
          error={errors?.label?.message}
          {...register('lot.label')}
        />
      </div>

      <SwitchField
        label={filament ? 'This roll is already partly used' : 'Some of it is already used'}
        description="Enter what is left now instead of the full amount."
        checked={lot.partlyUsed}
        onCheckedChange={(checked) => setValue('lot.partlyUsed', checked, { shouldDirty: true })}
      />
      {lot.partlyUsed && (
        <TextField
          label="Left now"
          required
          inputMode="decimal"
          mono
          suffix={unit}
          className="sm:max-w-xs"
          error={errors?.remaining?.message}
          {...register('lot.remaining')}
        />
      )}

      {canSeeFinance && (
        <div className="grid gap-5 sm:grid-cols-[1fr_120px]">
          <TextField
            label="Price paid"
            inputMode="decimal"
            mono
            hint={unitCost ?? 'Optional, but needed for costs and profit.'}
            error={errors?.price?.message}
            {...register('lot.price')}
          />
          <SelectField label="Currency" {...register('lot.currency')}>
            <option value="CAD">CAD</option>
            <option value="BRL">BRL</option>
          </SelectField>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Bought on"
          type="date"
          error={errors?.purchasedAt?.message}
          {...register('lot.purchasedAt')}
        />
        <TextField
          label="Store"
          placeholder="e.g. Amazon"
          error={errors?.store?.message}
          {...register('lot.store')}
        />
      </div>
      <TextAreaField
        label="Notes"
        rows={2}
        placeholder={filament ? 'e.g. opened on…, dried for 6 h' : undefined}
        error={errors?.notes?.message}
        {...register('lot.notes')}
      />

      {canManageFinance && (
        <div className="flex flex-col gap-4 rounded-[var(--radius-tile)] bg-bench p-5">
          <SwitchField
            label="Also record this purchase as an expense"
            description="One linked expense, never a duplicate. Leave it off for stock bought before using PrintBI."
            checked={lot.recordExpense}
            onCheckedChange={(checked) =>
              setValue('lot.recordExpense', checked, { shouldDirty: true })
            }
          />
          {lot.recordExpense && (
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                label="Expense category"
                required
                error={errors?.expenseCategoryId?.message}
                {...register('lot.expenseCategoryId')}
              >
                {categories
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </SelectField>
              <SelectField label="Payment" {...register('lot.paymentState')}>
                <option value="paid">Already paid</option>
                <option value="pending">Still to pay</option>
              </SelectField>
              {lot.paymentState === 'paid' && (
                <>
                  <TextField
                    label="Paid on"
                    type="date"
                    error={errors?.paidAt?.message}
                    {...register('lot.paidAt')}
                  />
                  <SelectField label="Method" {...register('lot.method')}>
                    <option value="credit">Credit card</option>
                    <option value="debit">Debit card</option>
                    <option value="cash">Cash</option>
                    <option value="transfer">Transfer</option>
                    <option value="other">Other</option>
                  </SelectField>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
