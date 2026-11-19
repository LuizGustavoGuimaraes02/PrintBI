import {
  COLLECTION_IMAGE_FORMATS,
  COLLECTION_IMAGE_MAX_BYTES,
  type CollectionImageSlot,
  type CollectionInput,
  type CollectionLanguage,
  type CollectionView,
  type ImageView,
} from '@printbi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ImagePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  Button,
  cn,
  Modal,
  Panel,
  PageLoader,
  TextAreaField,
  TextField,
  useToast,
} from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { acceptFor, checkFile, uploadImage, UploadError, useUploadConfig } from '../../lib/uploads';
import { useCan } from '../auth/account';
import { BrazilFlag, CanadaFlag } from '../showcase/language';
import { THEMES } from '../showcase/themes';
import { collectionKeys, useCollections } from './queries';

const base = '/companies/current/showcase/collections';

const message = (error: unknown) =>
  error instanceof ApiError || error instanceof UploadError ? error.message : 'Try again.';

/** What the PUT expects, from what the collection shows now. */
const toInput = (c: CollectionView, active = c.active): CollectionInput => ({
  active,
  name: c.name,
  title: c.title,
  intro: c.intro,
  alt: { pt: c.banners.pt.alt, en: c.banners.en.alt },
});

/** The four seasonal collections: hidden until the admin turns one on. */
export function CollectionsPanel() {
  const canManage = useCan('showcase:manage');
  const { data: collections } = useCollections();
  const [editing, setEditing] = useState<CollectionView | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const update = (saved: CollectionView) =>
    queryClient.setQueryData<CollectionView[]>(collectionKeys, (list) =>
      list?.map((c) => (c.key === saved.key ? saved : c)),
    );

  const toggle = async (collection: CollectionView) => {
    try {
      update(
        await api.put<CollectionView>(
          `${base}/${collection.key}`,
          toInput(collection, !collection.active),
        ),
      );
      toast.success(
        collection.active ? 'Hidden from visitors' : 'Shown to visitors',
        collection.name.en,
      );
    } catch (error) {
      toast.error('Not changed', message(error));
    }
  };

  return (
    <Panel
      title="Seasonal collections"
      description="Themed pages for Valentine’s Day, Easter, Halloween and Christmas. Each stays hidden until you turn it on; nothing switches by date. Turned on, it adds a banner to the top of your showcase."
    >
      {!collections ? (
        <PageLoader />
      ) : (
        <ul className="flex flex-col divide-y divide-rule-soft">
          {collections.map((collection) => {
            const theme = THEMES[collection.key];
            return (
              <li key={collection.key} className="flex flex-wrap items-center gap-4 py-3.5">
                <span
                  aria-hidden="true"
                  className="size-12 shrink-0 rounded-[14px]"
                  style={{
                    background: theme.vars['--t-hero'],
                    boxShadow: `inset 0 -14px 0 ${theme.vars['--t-accent']}`,
                  }}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-bold">
                    {collection.name.pt}{' '}
                    <span className="font-medium text-ink-muted">· {collection.name.en}</span>
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {collection.active
                      ? 'On · banner on your showcase'
                      : 'Off · hidden from visitors'}{' '}
                    · {collection.productCount}{' '}
                    {collection.productCount === 1 ? 'product' : 'products'}
                  </span>
                </span>
                {canManage && (
                  <>
                    <Link
                      to={`/showcase/collections/${collection.key}/preview`}
                      target="_blank"
                      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-teal-soft px-4 text-sm font-bold text-teal-ink hover:bg-[#d3eaee]"
                    >
                      Preview <ExternalLink size={14} aria-hidden="true" />
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(collection)}>
                      Edit
                    </Button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={collection.active}
                      aria-label={`Show ${collection.name.en} to visitors`}
                      onClick={() => void toggle(collection)}
                      className={cn(
                        'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors',
                        collection.active ? 'bg-teal' : 'bg-rule',
                      )}
                    >
                      <span
                        className={cn(
                          'block size-6 rounded-full bg-white shadow transition-transform',
                          collection.active ? 'translate-x-7' : 'translate-x-1',
                        )}
                      />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[13px] text-ink-muted">
        Add products to a collection on each product’s page. They keep showing on the main showcase
        either way.
      </p>
      {editing && (
        <CollectionDialog
          collection={collections?.find((c) => c.key === editing.key) ?? editing}
          onSaved={update}
          onClose={() => setEditing(null)}
        />
      )}
    </Panel>
  );
}

const LANGS: { value: CollectionLanguage; label: string; Flag: typeof BrazilFlag }[] = [
  { value: 'pt', label: 'Português', Flag: BrazilFlag },
  { value: 'en', label: 'English', Flag: CanadaFlag },
];

function CollectionDialog({
  collection,
  onSaved,
  onClose,
}: {
  collection: CollectionView;
  onSaved: (saved: CollectionView) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [lang, setLang] = useState<CollectionLanguage>('pt');
  const [form, setForm] = useState(() => toInput(collection));
  const [saving, setSaving] = useState(false);
  const field = (name: 'name' | 'title' | 'intro' | 'alt') => ({
    value: form[name]?.[lang] ?? '',
    onChange: (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [name]: { ...f[name], [lang]: e.target.value } })),
  });

  const save = async () => {
    setSaving(true);
    try {
      onSaved(
        await api.put<CollectionView>(`${base}/${collection.key}`, {
          ...form,
          active: collection.active,
        }),
      );
      toast.success('Collection saved', collection.name.en);
      onClose();
    } catch (error) {
      toast.error('Not saved', message(error));
    } finally {
      setSaving(false);
    }
  };

  const banner = collection.banners[lang];
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${collection.name.pt} · ${collection.name.en}`}
      description="Texts left empty use the default wording. English falls back to Portuguese."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div
          role="tablist"
          aria-label="Language of this content"
          className="flex gap-1 rounded-full bg-bench p-1"
        >
          {LANGS.map((l) => (
            <button
              key={l.value}
              type="button"
              role="tab"
              aria-selected={lang === l.value}
              onClick={() => setLang(l.value)}
              className={cn(
                'inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm font-bold',
                lang === l.value
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              <span className="inline-flex overflow-hidden rounded-[3px] ring-1 ring-black/10">
                <l.Flag width={22} />
              </span>
              {l.label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Name"
            maxLength={60}
            placeholder={collection.name[lang]}
            {...field('name')}
          />
          <TextField
            label="Title"
            maxLength={90}
            placeholder={collection.title[lang]}
            {...field('title')}
          />
          <TextAreaField
            label="Intro"
            rows={2}
            maxLength={300}
            className="sm:col-span-2"
            placeholder={collection.intro[lang]}
            {...field('intro')}
          />
        </div>
        <div className="flex flex-col gap-3 border-t border-rule-soft pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold">
              Banner {lang === 'en' ? '· English (optional)' : '· Portuguese'}
            </h3>
            <span className="text-[13px] text-ink-muted">
              JPG or WebP · up to 5 MB · keep text in the central 60%
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_132px]">
            <ImageSlotUpload
              collection={collection}
              slot="banner-desktop"
              lang={lang}
              image={banner.desktop}
              label="Desktop · 1920 × 640"
              aspect="3 / 1"
              safeArea="columns"
              onSaved={onSaved}
            />
            <ImageSlotUpload
              collection={collection}
              slot="banner-mobile"
              lang={lang}
              image={banner.mobile}
              label="Mobile · 1080 × 1350"
              aspect="4 / 5"
              safeArea="rows"
              onSaved={onSaved}
            />
          </div>
          <TextField
            label="Banner description"
            hint="Read aloud by screen readers. Describe what the image shows."
            maxLength={200}
            {...field('alt')}
          />
          {lang === 'en' && (
            <p className="text-[13px] text-ink-muted">
              Without an English banner, visitors reading in English see the Portuguese one.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-rule-soft pt-4">
          <h3 className="font-bold">Page header · optional</h3>
          <ImageSlotUpload
            collection={collection}
            slot="header"
            lang="pt"
            image={collection.header}
            label="1920 × 800 · both languages"
            aspect="12 / 5"
            onSaved={onSaved}
          />
          <p className="text-[13px] text-ink-muted">
            Replaces the themed illustration at the top of the page. Leave it empty to keep the
            illustration.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function ImageSlotUpload({
  collection,
  slot,
  lang,
  image,
  label,
  aspect,
  safeArea,
  onSaved,
}: {
  collection: CollectionView;
  slot: CollectionImageSlot;
  lang: CollectionLanguage;
  image: ImageView | null;
  label: string;
  aspect: string;
  safeArea?: 'columns' | 'rows';
  onSaved: (saved: CollectionView) => void;
}) {
  const toast = useToast();
  const { data: config } = useUploadConfig();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    const problem = checkFile(file, COLLECTION_IMAGE_FORMATS, COLLECTION_IMAGE_MAX_BYTES);
    if (problem) return toast.error('Image not added', problem);
    setBusy(true);
    try {
      const publicId = await uploadImage({ target: 'collection', key: collection.key }, file);
      onSaved(
        await api.post<CollectionView>(`${base}/${collection.key}/images`, {
          slot,
          lang,
          publicId,
        }),
      );
    } catch (error) {
      toast.error('Image not added', message(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      onSaved(
        await api.delete<CollectionView>(
          `${base}/${collection.key}/images?slot=${slot}&lang=${lang}`,
        ),
      );
    } catch (error) {
      toast.error('Not removed', message(error));
    } finally {
      setBusy(false);
    }
  };

  const enabled = config?.enabled ?? false;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="label-mono text-ink-muted">{label}</span>
      <button
        type="button"
        disabled={!enabled || busy}
        onClick={() => input.current?.click()}
        className="relative w-full overflow-hidden rounded-[14px] border-2 border-dashed border-rule bg-bench text-center hover:border-teal disabled:cursor-not-allowed"
        style={{ aspectRatio: aspect }}
      >
        {image ? (
          <img src={image.urls.full} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <>
            {safeArea === 'columns' && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 right-[20%] left-[20%] border-x-[1.5px] border-dashed border-teal bg-teal/5"
              />
            )}
            {safeArea === 'rows' && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-[20%] bottom-[20%] border-y-[1.5px] border-dashed border-teal bg-teal/5"
              />
            )}
            <span className="relative flex h-full flex-col items-center justify-center gap-1 p-2 text-[13px] font-semibold text-ink-muted">
              <ImagePlus size={20} aria-hidden="true" />
              {!enabled ? 'Storage not set up' : busy ? 'Uploading…' : 'Upload'}
            </span>
          </>
        )}
      </button>
      {image && (
        <div className="flex gap-2">
          <Button size="sm" variant="soft" loading={busy} onClick={() => input.current?.click()}>
            Replace
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove()}>
            Remove
          </Button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept={acceptFor(COLLECTION_IMAGE_FORMATS)}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
