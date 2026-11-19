import { CONSUMABLE_CATEGORIES, MATERIAL_TYPES, type FilamentProductView } from '@printbi/shared';
import { useId } from 'react';
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { SelectField, TextAreaField, TextField } from '../../design-system';
import { ColorPicker } from './ColorPicker';
import { FilamentProductPicker } from './FilamentProductPicker';
import { applyProduct, suggestedName, type ItemForm, type LotForm } from './forms';

export interface InventoryForm {
  item: ItemForm;
  hasStock: boolean;
  lot: LotForm;
  /** Multi-color purchases: identical rolls of this line. */
  rolls: string;
}

interface ItemFieldsProps {
  form: UseFormReturn<InventoryForm>;
  products: FilamentProductView[];
}

/**
 * What the item is: a filament (material, brand, color, temperatures) or another consumable.
 * The kind is chosen outside (the new-item page), and never changes while editing.
 */
export function ItemFields({ form, products }: ItemFieldsProps) {
  const { register, control, setValue, getValues, formState } = form;
  const errors = formState.errors.item;
  const item = useWatch({ control, name: 'item' });
  const materialsId = useId();
  const selectedProduct = products.find((p) => p.id === item.productId) ?? null;

  const dirty = { shouldDirty: true } as const;
  /** Keeps the proposed name in step while the user has not typed their own. */
  const refreshName = (before: ItemForm, after: ItemForm) => {
    const current = getValues('item.name').trim();
    if (!current || current === suggestedName(before))
      setValue('item.name', suggestedName(after), dirty);
  };

  return (
    <div className="@container flex flex-col gap-6">
      {item.kind === 'filament' ? (
        <>
          <FilamentProductPicker
            products={products}
            selected={selectedProduct}
            onSelect={(product) => {
              const before = { ...getValues('item') };
              if (!product) {
                setValue('item.productId', '', dirty);
                return;
              }
              const patch = applyProduct(before, product);
              Object.entries(patch).forEach(([key, value]) =>
                setValue(`item.${key as keyof ItemForm}`, value as never, dirty),
              );
              refreshName(before, { ...before, ...patch });
            }}
          />
          <div className="grid gap-5 @lg:grid-cols-2">
            <TextField
              label="Material"
              required
              list={materialsId}
              error={errors?.materialType?.message}
              {...register('item.materialType', {
                onChange: (e: { target: { value: string } }) => {
                  const before = { ...getValues('item') };
                  refreshName(
                    { ...before, materialType: before.materialType },
                    { ...before, materialType: e.target.value },
                  );
                },
              })}
            />
            <datalist id={materialsId}>
              {MATERIAL_TYPES.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <TextField label="Brand" error={errors?.brand?.message} {...register('item.brand')} />
          </div>
          <Controller
            control={control}
            name="item.colorKey"
            render={() => (
              <ColorPicker
                value={{
                  colorKey: item.colorKey,
                  colorName: item.colorName,
                  colorHex: item.colorHex,
                }}
                error={
                  errors?.colorKey?.message ??
                  errors?.colorName?.message ??
                  errors?.colorHex?.message
                }
                onChange={(color) => {
                  const before = { ...getValues('item') };
                  setValue('item.colorKey', color.colorKey, dirty);
                  setValue('item.colorName', color.colorName, dirty);
                  setValue('item.colorHex', color.colorHex, dirty);
                  refreshName(before, { ...before, ...color });
                }}
              />
            )}
          />
          <TextField
            label="Name"
            required
            hint="Shown everywhere this filament is used."
            error={errors?.name?.message}
            {...register('item.name')}
          />
          <details className="rounded-[var(--radius-tile)] bg-bench px-4 py-3">
            <summary className="cursor-pointer font-semibold">
              Diameter, density and temperatures
            </summary>
            <div className="mt-4 grid gap-5 @lg:grid-cols-2 @3xl:grid-cols-3">
              <TextField
                label="Diameter"
                inputMode="decimal"
                mono
                suffix="mm"
                error={errors?.diameterMm?.message}
                {...register('item.diameterMm')}
              />
              <TextField
                label="Density"
                inputMode="decimal"
                mono
                suffix="g/cm³"
                error={errors?.densityGcm3?.message}
                {...register('item.densityGcm3')}
              />
              <span className="hidden @3xl:block" />
              <TextField
                label="Nozzle min"
                inputMode="numeric"
                mono
                suffix="°C"
                error={errors?.nozzleTempMin?.message}
                {...register('item.nozzleTempMin')}
              />
              <TextField
                label="Nozzle max"
                inputMode="numeric"
                mono
                suffix="°C"
                error={errors?.nozzleTempMax?.message}
                {...register('item.nozzleTempMax')}
              />
              <span className="hidden @3xl:block" />
              <TextField
                label="Bed min"
                inputMode="numeric"
                mono
                suffix="°C"
                error={errors?.bedTempMin?.message}
                {...register('item.bedTempMin')}
              />
              <TextField
                label="Bed max"
                inputMode="numeric"
                mono
                suffix="°C"
                error={errors?.bedTempMax?.message}
                {...register('item.bedTempMax')}
              />
            </div>
          </details>
        </>
      ) : (
        <div className="grid gap-5 @lg:grid-cols-2">
          <TextField
            label="Name"
            required
            className="@lg:col-span-2"
            placeholder="e.g. M3 × 8 screw"
            error={errors?.name?.message}
            {...register('item.name')}
          />
          <TextField
            label="Category"
            required
            list={`${materialsId}-cat`}
            error={errors?.category?.message}
            {...register('item.category')}
          />
          <datalist id={`${materialsId}-cat`}>
            {CONSUMABLE_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <SelectField label="Unit" {...register('item.unit')}>
            <option value="unit">Units</option>
            <option value="g">Grams</option>
            <option value="m">Meters</option>
            <option value="ml">Milliliters</option>
            <option value="custom">Custom</option>
          </SelectField>
          {item.unit === 'custom' && (
            <TextField
              label="Unit name"
              required
              placeholder="e.g. sheets"
              error={errors?.customUnit?.message}
              {...register('item.customUnit')}
            />
          )}
          <TextAreaField
            label="Description"
            rows={2}
            className="@lg:col-span-2"
            error={errors?.description?.message}
            {...register('item.description')}
          />
        </div>
      )}

      <div className="grid gap-5 @lg:grid-cols-2">
        {/* Filament warns per roll (see the roll fields); other items warn on their total. */}
        {item.kind !== 'filament' && (
          <TextField
            label="Warn when left is at or below"
            inputMode="decimal"
            mono
            suffix={
              item.unit === 'custom'
                ? item.customUnit || 'units'
                : item.unit === 'unit'
                  ? 'units'
                  : item.unit
            }
            hint="Optional. Shows the item as low stock."
            error={errors?.lowStockThreshold?.message}
            {...register('item.lowStockThreshold')}
          />
        )}
        <TextAreaField
          label="Notes"
          rows={2}
          placeholder="e.g. dry before use"
          error={errors?.notes?.message}
          {...register('item.notes')}
        />
      </div>
    </div>
  );
}
