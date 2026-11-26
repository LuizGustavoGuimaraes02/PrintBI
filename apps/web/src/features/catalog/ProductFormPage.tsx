import {
  productInputSchema,
  type Currency,
  type LabelView,
  type ProductType,
  type ProductView,
} from '@printbi/shared';
import { ArrowLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import {
  Badge,
  Button,
  cn,
  ConfirmDialog,
  DeleteAction,
  EmptyState,
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
import { ProductPhotos } from './ProductPhotos';
import { ProductShowcasePanel } from './ProductShowcasePanel';
import { catalogKeys, useLabels, useProduct, useRefreshCatalog } from './queries';
import { keys as settingsKeys } from '../settings/queries';

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
  const queryClient = useQueryClient();
  const location = useLocation();
  const photosPanel = useRef<HTMLElement>(null);
  const focusPhotos = (location.state as { focus?: string } | null)?.focus === 'photos';

  // Arriving from "Save and add photos": bring the upload button into view.
  useEffect(() => {
    if (focusPhotos) photosPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusPhotos]);
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

  /** After saving: back to the list, a blank form for the next one, or this product's photos. */
  const submit = (then: 'list' | 'another' | 'photos') =>
    handleSubmit(async (values) => {
      const payload = productPayload(values, canSeeCost);
      if (!checkPayload(productInputSchema, payload, setError, productFormPath)) return;
      try {
        const saved = product
          ? await api.put<ProductView>(`/products/${product.id}`, payload)
          : await api.post<ProductView>('/products', payload);
        await refresh();
        toast.success(product ? 'Changes saved' : 'Added to the catalog', saved.name);
        if (then === 'another') reset(emptyProduct(values.currency));
        else {
          allowLeave();
          void navigate(then === 'photos' ? `/products/${saved.id}` : '/products', {
            replace: then === 'photos',
            state: then === 'photos' ? { focus: 'photos' } : undefined,
          });
        }
      } catch (error) {
        applyMappedServerErrors(error, setError, productFormPath);
      }
    });

  /** Photos and showcase settings save on their own, without the form's Save button. */
  const applySaved = (saved: ProductView) => {
    queryClient.setQueryData(catalogKeys.product(saved.id), saved);
    void queryClient.invalidateQueries({ queryKey: ['catalog', 'products'] });
    void queryClient.invalidateQueries({ queryKey: settingsKeys.showcaseProducts });
  };

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

  const showcase = product && <ProductShowcasePanel product={product} onChange={applySaved} />;

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
          canArchive && (
            <>
              {product.archived ? (
                <Button
                  variant="soft"
                  hint="Puts it back in the catalog, ready for new quotes and sales."
                  onClick={() => void setArchived(false)}
                >
                  Restore
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  hint="Takes it out of the catalog for new quotes and sales. Past records keep it."
                  onClick={() => setArchiving(true)}
                >
                  Archive
                </Button>
              )}
              <DeleteAction
                title={`Delete ${product.name}?`}
                description="Removed for good, with its photos. Use it for something added by mistake; archive what you stopped selling, to keep it in past records."
                confirmLabel={product.type === 'service' ? 'Delete service' : 'Delete product'}
                hint="Deletes it with its photos, for something added by mistake. Archive keeps it in past records."
                onDelete={async () => {
                  try {
                    await api.delete(`/products/${product.id}`);
                  } catch (e) {
                    toast.error('Not deleted', e instanceof ApiError ? e.message : undefined);
                    throw e;
                  }
                  toast.success('Deleted', product.name);
                  allowLeave();
                  void navigate('/products', { replace: true });
                  await refresh();
                }}
              />
            </>
          )
        }
      />
      {product?.archived && (
        <Notice title="Archived">
          Hidden from the catalog and from new quotes and sales. Past records keep it.
        </Notice>
      )}

      {/*
        One grid for the whole page: [main | 340px side]. The photo column inside Details is
        sized so its content lines up with the Showcase card below it.
      */}
      <form
        onSubmit={(e) => void submit('list')(e)}
        noValidate
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        <Panel title="Details" className="lg:col-span-2">
          <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_284px]">
            <div className="flex min-w-0 flex-col gap-5">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <TextField
                  label="Name"
                  required
                  placeholder={type === 'service' ? 'e.g. 3D modelling' : 'e.g. Articulated dragon'}
                  error={errors.name?.message}
                  {...register('name')}
                />
                <fieldset className="flex min-w-0 flex-col gap-1.5">
                  <legend className="label-mono mb-1.5 text-ink-muted">Type</legend>
                  <div className="flex h-12 rounded-full bg-bench p-1">
                    {TYPES.map((t) => (
                      <label
                        key={t.value}
                        title={t.hint}
                        className={cn(
                          'flex flex-1 cursor-pointer items-center justify-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-teal',
                          type === t.value
                            ? 'bg-surface text-ink shadow-sm'
                            : 'text-ink-muted hover:text-ink',
                        )}
                      >
                        <input
                          type="radio"
                          value={t.value}
                          className="sr-only"
                          {...register('type')}
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <TextAreaField
                label="Description"
                rows={3}
                hint="Customers see this on the showcase."
                error={errors.description?.message}
                {...register('description')}
              />
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
              <TextAreaField
                label="Private notes"
                rows={2}
                hint="Print settings, supplier... only your team sees this."
                error={errors.notes?.message}
                {...register('notes')}
              />
            </div>
            <section
              ref={photosPanel}
              aria-label="Photos"
              className="scroll-mt-6 lg:border-l lg:border-rule-soft lg:pl-8"
            >
              <ProductPhotos
                product={product}
                onChange={applySaved}
                onSaveFirst={() => void submit('photos')()}
                saving={formState.isSubmitting}
              />
            </section>
          </div>
        </Panel>

        <Panel
          title={type === 'product' ? 'Price and size' : 'Price'}
          className={cn(!showcase && 'lg:col-span-2')}
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <SelectField label="Sold" {...register('saleUnit')}>
              <option value="unit">Per piece</option>
              <option value="hour">Per hour</option>
              <option value="service">Per job</option>
              <option value="custom">Other unit</option>
            </SelectField>
            {saleUnit === 'custom' && (
              <TextField
                label="Unit name"
                required
                placeholder="e.g. set of 4"
                error={errors.customUnit?.message}
                {...register('customUnit')}
              />
            )}
            <SelectField label="Currency" {...register('currency')}>
              {(['CAD', 'BRL'] as Currency[]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
            <TextField label="Usual price" {...money('price')} />
            {canSeeCost && <TextField label="Estimated cost" {...money('estimatedCost')} />}
          </div>
          <p className="-mt-1 text-[13px] text-ink-muted">
            Leave the price empty to price each quote.
            {margin && <span className="figure"> · {margin}</span>}
          </p>
          {type === 'product' && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-rule-soft pt-4">
                <h3 className="font-bold whitespace-nowrap">Typical piece</h3>
                <span className="text-[13px] text-ink-muted">
                  Shown on the showcase; starts a calculation.
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
                <TextField
                  label="Filament"
                  inputMode="decimal"
                  mono
                  suffix="g"
                  error={errors.filamentGrams?.message}
                  {...register('filamentGrams')}
                />
              </div>
            </>
          )}
        </Panel>

        {showcase}

        {/* Actions sit on the right, the main one last, where the eye ends the form. */}
        <div className="flex flex-wrap items-center justify-end gap-3 lg:col-span-2">
          {errors.root?.server && (
            <div className="w-full">
              <Notice tone="attention" title="Not saved">
                {errors.root.server.message}
              </Notice>
            </div>
          )}
          {product && product.soldQuantity > 0 && (
            <span className="mr-auto">
              <Badge>{product.soldQuantity} sold</Badge>
            </span>
          )}
          <Button variant="ghost" onClick={() => void navigate('/products')}>
            Cancel
          </Button>
          {!product && (
            <Button
              variant="soft"
              loading={formState.isSubmitting}
              onClick={() => void submit('another')()}
            >
              Save &amp; add another
            </Button>
          )}
          <Button type="submit" loading={formState.isSubmitting}>
            {product ? 'Save changes' : 'Save'}
          </Button>
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
