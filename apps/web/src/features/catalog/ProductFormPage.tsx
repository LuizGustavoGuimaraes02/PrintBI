import {
  productInputSchema,
  type Currency,
  type LabelView,
  type ProductType,
  type ProductView,
} from '@printbi/shared';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Badge,
  Button,
  cn,
  ConfirmDialog,
  EmptyState,
  ImageSlot,
  Notice,
  PageHeader,
  PageLoader,
  Panel,
  SelectField,
  TextAreaField,
  TextField,
  useToast,
} from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { applyMappedServerErrors, checkPayload } from '../../lib/forms';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { useCan } from '../auth/account';
import { useSettings } from '../settings/queries';
import {
  emptyProduct,
  marginNote,
  productFormPath,
  productPayload,
  productToForm,
  type ProductForm,
} from './forms';
import { LabelPicker } from './LabelPicker';
import { useLabels, useProduct, useRefreshCatalog } from './queries';

export function NewProductPage() {
  const { data: settings } = useSettings();
  const { data: labels } = useLabels();
  if (!settings || !labels) return <PageLoader />;
  return (
    <ProductEditor initial={emptyProduct(settings.currency.defaultCurrency)} labels={labels} />
  );
}

export function ProductPage() {
  const { productId = '' } = useParams();
  const { data: product, isPending } = useProduct(productId);
  const { data: settings } = useSettings();
  const { data: labels } = useLabels();
  if (isPending || !settings || !labels) return <PageLoader label="Loading product" />;
  if (!product) {
    return (
      <EmptyState
        title="Product not found"
        action={
          <Link to="/products" className="font-semibold text-teal">
            Back to products
          </Link>
        }
      >
        It may belong to another business.
      </EmptyState>
    );
  }
  return (
    <ProductEditor
      key={product.id}
      product={product}
      initial={productToForm(product, settings.currency.defaultCurrency)}
      labels={labels}
    />
  );
}

const TYPES: { value: ProductType; label: string; hint: string }[] = [
  { value: 'product', label: 'Product', hint: 'A printed piece you sell' },
  { value: 'service', label: 'Service', hint: 'Modelling, repairs, printing on demand' },
];

interface ProductEditorProps {
  product?: ProductView;
  initial: ProductForm;
  labels: LabelView[];
}

function ProductEditor({ product, initial, labels }: ProductEditorProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const refresh = useRefreshCatalog();
  const canSeeCost = useCan('finance:view');
  const canArchive = useCan('records:archive');
  const [archiving, setArchiving] = useState(false);
  const { register, handleSubmit, control, reset, setError, formState } = useForm<ProductForm>({
    defaultValues: initial,
  });
  const [type, saleUnit, currency, price, estimatedCost] = useWatch({
    control,
    name: ['type', 'saleUnit', 'currency', 'price', 'estimatedCost'],
  });
  const { prompt: guard, allowLeave } = useUnsavedChangesGuard(formState.isDirty);
  const margin = canSeeCost ? marginNote(price, estimatedCost) : null;

  const submit = (addAnother: boolean) =>
    handleSubmit(async (values) => {
      const payload = productPayload(values, canSeeCost);
      if (!checkPayload(productInputSchema, payload, setError, productFormPath)) return;
      try {
        const saved = product
          ? await api.put<ProductView>(`/products/${product.id}`, payload)
          : await api.post<ProductView>('/products', payload);
        await refresh();
        toast.success(product ? 'Changes saved' : 'Added to the catalog', saved.name);
        if (addAnother) reset(emptyProduct(values.currency));
        else {
          allowLeave();
          void navigate('/products');
        }
      } catch (error) {
        applyMappedServerErrors(error, setError, productFormPath);
      }
    });

  const setArchived = async (archived: boolean) => {
    if (!product) return;
    try {
      await api.post(`/products/${product.id}/archive`, { archived });
      await refresh();
      toast.success(archived ? 'Archived' : 'Restored', product.name);
    } catch (e) {
      toast.error('Not changed', e instanceof ApiError ? e.message : undefined);
    } finally {
      setArchiving(false);
    }
  };

  const { errors } = formState;
  const money = (name: 'price' | 'estimatedCost') => ({
    inputMode: 'decimal' as const,
    mono: true,
    suffix: currency,
    error: errors[name]?.message,
    ...register(name),
  });

  return (
    <>
      {guard}
      <Link
        to="/products"
        className="inline-flex items-center gap-1.5 self-start px-1 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Products &amp; Services
      </Link>
      <PageHeader
        eyebrow="Catalog"
        title={product ? product.name : 'New product or service'}
        description={
          product
            ? 'Price and details used as the starting point for quotes and sales.'
            : 'Something you sell. Quotes and sales start from these details and can still change them.'
        }
        actions={
          product &&
          canArchive &&
          (product.archived ? (
            <Button variant="soft" onClick={() => void setArchived(false)}>
              Restore
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setArchiving(true)}>
              Archive
            </Button>
          ))
        }
      />
      {product?.archived && (
        <Notice title="Archived">
          Hidden from the catalog and from new quotes and sales. Past records keep it.
        </Notice>
      )}

      <form onSubmit={(e) => void submit(false)(e)} noValidate className="flex flex-col gap-5">
        <Panel title="What it is">
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="sr-only">Type</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {TYPES.map((t) => (
                <label
                  key={t.value}
                  className={cn(
                    'flex cursor-pointer flex-col gap-0.5 rounded-[var(--radius-tile)] border-[1.5px] px-4 py-3',
                    type === t.value ? 'border-teal bg-teal-soft' : 'border-rule hover:bg-bench',
                  )}
                >
                  <span className="flex items-center gap-2 font-bold">
                    <input
                      type="radio"
                      value={t.value}
                      className="accent-teal"
                      {...register('type')}
                    />
                    {t.label}
                  </span>
                  <span className="pl-6 text-[13px] text-ink-muted">{t.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Name"
              required
              className="sm:col-span-2"
              placeholder={type === 'service' ? 'e.g. 3D modelling' : 'e.g. Articulated dragon'}
              error={errors.name?.message}
              {...register('name')}
            />
            <TextAreaField
              label="Description"
              rows={3}
              className="sm:col-span-2"
              hint="Customers will see this on the showcase."
              error={errors.description?.message}
              {...register('description')}
            />
          </div>
          <Controller
            control={control}
            name="labelIds"
            render={({ field, fieldState }) => (
              <LabelPicker
                labels={labels}
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
        </Panel>

        <Panel title="Price">
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField label="Sold" {...register('saleUnit')}>
              <option value="unit">Per piece</option>
              <option value="hour">Per hour</option>
              <option value="service">Per job</option>
              <option value="custom">Other unit</option>
            </SelectField>
            {saleUnit === 'custom' ? (
              <TextField
                label="Unit name"
                required
                placeholder="e.g. set of 4"
                error={errors.customUnit?.message}
                {...register('customUnit')}
              />
            ) : (
              <span className="hidden sm:block" />
            )}
            <TextField
              label="Usual price"
              hint="Leave empty to price each quote."
              {...money('price')}
            />
            <SelectField label="Currency" {...register('currency')}>
              {(['CAD', 'BRL'] as Currency[]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
            {canSeeCost && (
              <TextField
                label="Estimated cost"
                hint="Your cost to make one. Saved calculations will fill this in."
                {...money('estimatedCost')}
              />
            )}
          </div>
          {margin && <p className="figure text-sm text-ink-muted">{margin}</p>}
        </Panel>

        {type === 'product' && (
          <Panel
            title="Size and filament"
            description="A typical piece. Shown on the showcase and used to start a calculation."
          >
            <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
              {(['widthMm', 'depthMm', 'heightMm'] as const).map((name, i) => (
                <TextField
                  key={name}
                  label={['Width', 'Depth', 'Height'][i] ?? ''}
                  inputMode="decimal"
                  mono
                  suffix="mm"
                  error={errors[name]?.message}
                  {...register(name)}
                />
              ))}
            </div>
            <TextField
              label="Filament used"
              inputMode="decimal"
              mono
              suffix="g"
              className="sm:max-w-56"
              error={errors.filamentGrams?.message}
              {...register('filamentGrams')}
            />
          </Panel>
        )}

        <Panel title="Photos and notes">
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            <ImageSlot label="Product photos" size="1600 × 1600" formats="JPG, WebP, PNG · up to 8">
              <span className="max-w-56 text-[13px] text-ink-muted">
                Photo uploads open with the showcase.
              </span>
            </ImageSlot>
            <TextAreaField
              label="Private notes"
              rows={5}
              hint="Print settings, supplier, anything only your team should see."
              error={errors.notes?.message}
              {...register('notes')}
            />
          </div>
        </Panel>

        {errors.root?.server && (
          <Notice tone="attention" title="Not saved">
            {errors.root.server.message}
          </Notice>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={formState.isSubmitting}>
            {product ? 'Save changes' : 'Save'}
          </Button>
          {!product && (
            <Button
              variant="soft"
              loading={formState.isSubmitting}
              onClick={() => void submit(true)()}
            >
              Save &amp; add another
            </Button>
          )}
          <Button variant="ghost" onClick={() => void navigate('/products')}>
            Cancel
          </Button>
          {product && product.soldQuantity > 0 && <Badge>{product.soldQuantity} sold</Badge>}
        </div>
      </form>

      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title="Archive this product?"
        description="It leaves the catalog and can't be added to new quotes or sales. Past records keep it, and you can restore it later."
        confirmLabel="Archive"
        onConfirm={() => void setArchived(true)}
      />
    </>
  );
}
