import { zodResolver } from '@hookform/resolvers/zod';
import {
  DEFAULT_WHATSAPP_MESSAGE,
  showcaseSettingsSchema,
  whatsappProductLink,
  type ProductView,
  type ShowcaseSettingsInput,
  type ShowcaseSettingsView,
} from '@printbi/shared';
import { ArrowDown, ArrowUp, Copy, ExternalLink, ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Notice,
  PageHeader,
  PageLoader,
  Panel,
  SelectField,
  SwitchField,
  TextAreaField,
  TextField,
  useToast,
} from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { useCan } from '../auth/account';
import { badgeLabel } from '../catalog/ProductShowcasePanel';
import { CollectionsPanel } from './CollectionsPanel';
import { keys, useSaving, useShowcaseProducts, useShowcaseSettings } from './queries';

const toForm = (view: ShowcaseSettingsView): ShowcaseSettingsInput => ({
  published: view.published,
  slug: view.slug,
  title: view.title,
  description: view.description,
  language: view.language,
  whatsapp: view.whatsapp,
  messageTemplate: view.messageTemplate,
});

export function ShowcasePage() {
  const { data } = useShowcaseSettings();
  return (
    <>
      <PageHeader
        eyebrow="Public page"
        title="Showcase"
        description="What customers see when you share your link: the products you chose, with photos and a WhatsApp button."
      />
      {data ? <ShowcaseSettingsForm settings={data} /> : <PageLoader />}
      <CollectionsPanel />
      <ShowcaseOrder />
    </>
  );
}

function ShowcaseSettingsForm({ settings }: { settings: ShowcaseSettingsView }) {
  const canManage = useCan('showcase:manage');
  const toast = useToast();
  const save = useSaving(
    (values: ShowcaseSettingsInput) =>
      api.put<ShowcaseSettingsView>('/companies/current/showcase', values),
    [keys.showcase],
    'Showcase saved',
  );
  const { register, handleSubmit, reset, setError, control, formState } =
    useForm<ShowcaseSettingsInput>({
      resolver: zodResolver(showcaseSettingsSchema, undefined, { raw: true }),
      defaultValues: toForm(settings),
    });
  const { errors, isDirty } = formState;
  const { prompt: guard } = useUnsavedChangesGuard(isDirty);
  const [slug, language, whatsapp, template] = useWatch({
    control,
    name: ['slug', 'language', 'whatsapp', 'messageTemplate'],
  });

  useEffect(() => reset(toForm(settings)), [settings, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      reset(toForm(await save.mutateAsync(values)));
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  const publicUrl = `${window.location.origin}${settings.publicPath}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy', publicUrl);
    }
  };

  const lang = language ?? 'pt-BR';
  const preview = (template || DEFAULT_WHATSAPP_MESSAGE[lang]).replace(
    /\{(product|produto)\}/g,
    lang === 'en' ? 'Articulated dragon' : 'Dragão articulado',
  );
  const whatsappReady = whatsappProductLink(whatsapp ?? '', '', lang, 'x') !== null;

  return (
    <Panel
      title="Settings"
      description="Turn on “Show on the showcase” on each product to add it here."
      actions={
        settings.published && (
          <>
            <Button variant="soft" size="sm" icon={<Copy size={16} />} onClick={() => void copy()}>
              Copy link
            </Button>
            <Link
              to={settings.publicPath}
              target="_blank"
              className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-teal hover:bg-bench"
            >
              Open <ExternalLink size={14} aria-hidden="true" />
            </Link>
          </>
        )
      }
    >
      {guard}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <fieldset disabled={!canManage} className="flex min-w-0 flex-col gap-6">
          <Controller
            control={control}
            name="published"
            render={({ field }) => (
              <SwitchField
                label="Published"
                description={
                  field.value
                    ? 'Anyone with the link can see the products you chose to show.'
                    : 'While off, the link answers “not found”.'
                }
                checked={field.value}
                disabled={!canManage}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Link"
              required
              className="sm:col-span-2"
              leading={`${window.location.host}/s/`}
              hint={`Lowercase letters, numbers and hyphens. Changing it breaks links you already shared.`}
              error={errors.slug?.message}
              mono
              {...register('slug')}
            />
            <TextField
              label="Title"
              placeholder="e.g. Printed to order in Toronto"
              hint="Shown under your business name."
              error={errors.title?.message}
              {...register('title')}
            />
            <SelectField label="Showcase language" {...register('language')}>
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en">English</option>
            </SelectField>
            <TextAreaField
              label="About"
              rows={3}
              className="sm:col-span-2"
              placeholder="What you make, delivery area, how long orders take…"
              error={errors.description?.message}
              {...register('description')}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="WhatsApp number"
              type="tel"
              placeholder="+55 11 91234-5678"
              hint="With the country code. Each product gets a button that opens a chat."
              error={errors.whatsapp?.message}
              {...register('whatsapp')}
            />
            <span className="hidden sm:block" />
            <TextAreaField
              label="First message"
              rows={3}
              placeholder={DEFAULT_WHATSAPP_MESSAGE[lang]}
              hint="Leave empty for the default. {product} becomes the product name."
              error={errors.messageTemplate?.message}
              {...register('messageTemplate')}
            />
            <div className="flex flex-col gap-2">
              <span className="label-mono text-ink-muted">Preview</span>
              <p className="rounded-[18px] rounded-tr-[6px] bg-teal-soft px-4 py-3 text-sm text-teal-ink">
                {preview}
              </p>
              {!whatsappReady && (
                <p className="text-xs text-ink-muted">
                  Without a number, the showcase shows no WhatsApp button.
                </p>
              )}
            </div>
          </div>
        </fieldset>

        {slug !== settings.slug && settings.published && (
          <Notice title="The link will change">
            Links you already shared to /s/{settings.slug} will stop working.
          </Notice>
        )}
        {errors.root?.server && (
          <Notice tone="attention" title="Not saved">
            {errors.root.server.message}
          </Notice>
        )}
        {canManage ? (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={save.isPending} disabled={!isDirty}>
              Save
            </Button>
            <Button variant="ghost" disabled={!isDirty} onClick={() => reset(toForm(settings))}>
              Cancel
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Only an admin can change the showcase.</p>
        )}
      </form>
    </Panel>
  );
}

function ShowcaseOrder() {
  const canManage = useCan('showcase:manage');
  const toast = useToast();
  const { data: products, refetch } = useShowcaseProducts();
  const [order, setOrder] = useState<ProductView[] | null>(null);
  const [saving, setSaving] = useState(false);
  const list = order ?? products ?? [];
  const changed = order !== null;

  const move = (from: number, to: number) => {
    const next = [...list];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    setOrder(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/companies/current/showcase/order', { productIds: list.map((p) => p.id) });
      await refetch();
      setOrder(null);
      toast.success('Order saved');
    } catch (error) {
      toast.error('Not saved', error instanceof ApiError ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="On the showcase"
      description="The order customers see. Featured products show as a larger tile."
      actions={
        changed && (
          <>
            <Button size="sm" loading={saving} onClick={() => void save()}>
              Save order
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOrder(null)}>
              Cancel
            </Button>
          </>
        )
      }
    >
      {list.length === 0 ? (
        <EmptyState
          title="Nothing on the showcase yet"
          action={
            <Link to="/products" className="font-semibold text-teal">
              Go to products
            </Link>
          }
        >
          Open a product and turn on “Show on the showcase”.
        </EmptyState>
      ) : (
        <ol className="flex flex-col divide-y divide-rule-soft">
          {list.map((product, index) => (
            <li key={product.id} className="flex items-center gap-4 py-3">
              <span className="figure w-6 text-right text-sm text-ink-muted">{index + 1}</span>
              {product.images[0] ? (
                <img
                  src={product.images[0].urls.thumb}
                  alt=""
                  width={48}
                  height={48}
                  className="size-12 rounded-[10px] object-cover"
                />
              ) : (
                <span className="flex size-12 items-center justify-center rounded-[10px] bg-bench text-steel">
                  <ImageIcon size={20} aria-hidden="true" />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link
                  to={`/products/${product.id}`}
                  className="truncate font-semibold hover:underline"
                >
                  {product.name}
                </Link>
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{badgeLabel(product.showcase.badge)}</Badge>
                  {product.showcase.featured && <Badge tone="teal">Featured</Badge>}
                  {product.images.length === 0 && <Badge tone="hot">No photo</Badge>}
                </div>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <IconButton
                    label={`Move ${product.name} up`}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowUp size={16} />
                  </IconButton>
                  <IconButton
                    label={`Move ${product.name} down`}
                    disabled={index === list.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown size={16} />
                  </IconButton>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
