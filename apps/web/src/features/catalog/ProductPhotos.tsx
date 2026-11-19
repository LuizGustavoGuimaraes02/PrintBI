import {
  MAX_PRODUCT_IMAGES,
  PRODUCT_IMAGE_FORMATS,
  PRODUCT_IMAGE_MAX_BYTES,
  type ImageView,
  type ProductView,
} from '@printbi/shared';
import { ArrowLeft, ArrowRight, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Button, cn, ConfirmDialog, IconButton, useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { acceptFor, checkFile, uploadImage, UploadError, useUploadConfig } from '../../lib/uploads';

interface ProductPhotosProps {
  /** Missing while the product is not saved yet: photos need a product to belong to. */
  product?: ProductView;
  onChange: (product: ProductView) => void;
  /** Saves a new product and opens it, so photos can be added right away. */
  onSaveFirst?: () => void;
  saving?: boolean;
}

const SIZE = '1600 × 1600';
const RULES = 'Square, 1600 × 1600 · JPG, WebP or PNG · up to 5 MB each';

const message = (error: unknown) =>
  error instanceof ApiError || error instanceof UploadError ? error.message : 'Try again.';

/**
 * The photo column of the product page: a large preview of the selected photo with its
 * actions, a strip of thumbnails, and drag and drop. Built to fit a narrow side column.
 */
export function ProductPhotos({ product, onChange, onSaveFirst, saving }: ProductPhotosProps) {
  const { data: config } = useUploadConfig();
  if (!product) {
    return (
      <PhotoColumn count={0}>
        <Placeholder>
          <span className="text-sm text-ink-muted">
            Photos are added once the product is saved.
          </span>
          {onSaveFirst && (
            <Button
              variant="soft"
              size="sm"
              icon={<ImagePlus size={16} />}
              loading={saving}
              onClick={onSaveFirst}
            >
              Save and add photos
            </Button>
          )}
        </Placeholder>
      </PhotoColumn>
    );
  }
  if (config && !config.enabled) {
    return (
      <PhotoColumn count={product.images.length}>
        <Placeholder>
          <span className="text-sm text-ink-muted">
            Image storage is not set up on the server yet (CLOUDINARY_URL).
          </span>
        </Placeholder>
      </PhotoColumn>
    );
  }
  return <PhotoManager product={product} onChange={onChange} />;
}

function PhotoColumn({
  count,
  children,
  ...rest
}: {
  count: number;
  children: ReactNode;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: DragEvent) => void;
}) {
  return (
    <div className="flex flex-col gap-3" {...rest}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-bold">Photos</h3>
        <span className="figure text-xs text-ink-muted">
          {count}/{MAX_PRODUCT_IMAGES}
        </span>
      </div>
      {children}
      <p className="text-xs text-ink-muted">{RULES}. The first photo is the cover.</p>
    </div>
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-tile)] border-2 border-dashed border-rule bg-bench p-5 text-center">
      <ImagePlus size={30} strokeWidth={1.5} aria-hidden="true" className="text-steel" />
      <span className="figure text-[13px]">{SIZE}</span>
      {children}
    </div>
  );
}

function PhotoManager({
  product,
  onChange,
}: {
  product: ProductView;
  onChange: ProductPhotosProps['onChange'];
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; share: number } | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<ImageView | null>(null);
  const images = product.images;
  const room = MAX_PRODUCT_IMAGES - images.length;
  const index = Math.max(
    0,
    images.findIndex((image) => image.id === selectedId),
  );
  const current = images[index];
  const uploading = progress !== null;
  const overall = progress ? (progress.done + progress.share) / progress.total : 0;

  const addFiles = async (files: File[]) => {
    if (uploading) return;
    const picked = files.slice(0, room);
    if (files.length > room) {
      toast.error('Too many photos', `Only ${room} more fit (up to ${MAX_PRODUCT_IMAGES}).`);
    }
    const ok = picked.filter((file) => {
      const problem = checkFile(file, PRODUCT_IMAGE_FORMATS, PRODUCT_IMAGE_MAX_BYTES);
      if (problem) toast.error('Photo skipped', problem);
      return !problem;
    });
    for (const [i, file] of ok.entries()) {
      setProgress({ done: i, total: ok.length, share: 0 });
      try {
        const publicId = await uploadImage(
          { target: 'product', productId: product.id },
          file,
          (share) => setProgress({ done: i, total: ok.length, share }),
        );
        const saved = await api.post<ProductView>(`/products/${product.id}/images`, { publicId });
        onChange(saved);
        setSelectedId(saved.images.at(-1)?.id ?? null);
      } catch (error) {
        toast.error('Photo not added', message(error));
      }
    }
    setProgress(null);
  };

  const save = async (next: ImageView[]) => {
    try {
      onChange(
        await api.put<ProductView>(`/products/${product.id}/images`, {
          images: next.map((image) => ({ id: image.id, alt: image.alt })),
        }),
      );
    } catch (error) {
      toast.error('Not saved', message(error));
    }
  };

  const move = (from: number, to: number) => {
    const next = [...images];
    const [image] = next.splice(from, 1);
    if (!image) return;
    next.splice(to, 0, image);
    void save(next);
  };

  const saveAlt = (image: ImageView, alt: string) => {
    if (alt.trim() === image.alt) return;
    void save(images.map((i) => (i.id === image.id ? { ...i, alt: alt.trim() } : i)));
  };

  const remove = async (image: ImageView) => {
    try {
      onChange(await api.delete<ProductView>(`/products/${product.id}/images/${image.id}`));
      setSelectedId(null);
      toast.success('Photo removed');
    } catch (error) {
      toast.error('Not removed', message(error));
    } finally {
      setRemoving(null);
    }
  };

  const drop = {
    onDragOver: (e: DragEvent) => {
      if (room <= 0 || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) void addFiles(files);
    },
  };

  const progressBar = uploading && (
    <span
      role="progressbar"
      aria-label="Upload progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(overall * 100)}
      className="block h-1.5 w-3/4 overflow-hidden rounded-full bg-rule"
    >
      <span
        className="block h-full rounded-full bg-teal transition-[width]"
        style={{ width: `${Math.round(overall * 100)}%` }}
      />
    </span>
  );

  return (
    <PhotoColumn count={images.length} {...drop}>
      {current ? (
        <>
          <div
            className={cn(
              'relative overflow-hidden rounded-[var(--radius-tile)] border border-rule-soft bg-bench',
              dragging && 'outline-2 outline-offset-2 outline-teal',
            )}
          >
            <img
              key={current.id}
              src={current.urls.card}
              alt={current.alt || `Photo ${index + 1} of ${product.name}`}
              width={800}
              height={800}
              className="aspect-square w-full object-cover"
            />
            {index === 0 && (
              <span className="label-mono absolute top-2.5 left-2.5 rounded-full bg-ink px-2.5 py-1 text-white">
                Cover
              </span>
            )}
            {dragging && (
              <span className="absolute inset-0 flex items-center justify-center bg-teal/80 font-semibold text-white">
                Drop to add
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <IconButton
              label="Move earlier"
              disabled={index === 0 || uploading}
              onClick={() => move(index, index - 1)}
            >
              <ArrowLeft size={16} />
            </IconButton>
            <IconButton
              label="Move later"
              disabled={index === images.length - 1 || uploading}
              onClick={() => move(index, index + 1)}
            >
              <ArrowRight size={16} />
            </IconButton>
            {index > 0 ? (
              <Button variant="ghost" size="sm" disabled={uploading} onClick={() => move(index, 0)}>
                Make cover
              </Button>
            ) : (
              <span className="px-2 text-xs text-ink-muted">Shown first</span>
            )}
            <IconButton
              label="Remove photo"
              className="ml-auto"
              disabled={uploading}
              onClick={() => setRemoving(current)}
            >
              <Trash2 size={16} />
            </IconButton>
          </div>

          <label className="flex flex-col gap-1">
            <span className="sr-only">Description of the selected photo</span>
            <input
              key={`${current.id}-${current.alt}`}
              defaultValue={current.alt}
              maxLength={200}
              placeholder="Describe this photo"
              title="Read aloud by screen readers and shown if the photo fails to load"
              onBlur={(e) => saveAlt(current, e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              className="h-10 w-full rounded-[12px] border border-rule bg-surface px-3 text-[13px] focus:border-teal focus:outline-none"
            />
          </label>

          <ul className="grid grid-cols-4 gap-2">
            {images.map((image, i) => (
              <li key={image.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(image.id)}
                  aria-label={`Select photo ${i + 1}${i === 0 ? ' (cover)' : ''}`}
                  aria-pressed={i === index}
                  className={cn(
                    'block w-full overflow-hidden rounded-[10px] border-2 transition-opacity',
                    i === index ? 'border-teal' : 'border-transparent opacity-75 hover:opacity-100',
                  )}
                >
                  <img
                    src={image.urls.thumb}
                    alt=""
                    width={120}
                    height={120}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                </button>
              </li>
            ))}
            {room > 0 && (
              <li>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => input.current?.click()}
                  aria-label={uploading ? 'Uploading photos' : 'Add photos'}
                  title="Add photos"
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-rule bg-bench text-steel hover:border-teal hover:text-teal disabled:cursor-wait"
                >
                  {uploading ? (
                    <span className="figure text-[11px]">
                      {(progress?.done ?? 0) + 1}/{progress?.total}
                    </span>
                  ) : (
                    <Plus size={20} aria-hidden="true" />
                  )}
                </button>
              </li>
            )}
          </ul>
          {progressBar}
        </>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => input.current?.click()}
          className={cn(
            'flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-tile)] border-2 border-dashed bg-bench p-5 text-center transition-colors hover:border-teal disabled:cursor-wait',
            dragging ? 'border-teal bg-teal-soft' : 'border-rule',
          )}
        >
          <ImagePlus size={30} strokeWidth={1.5} aria-hidden="true" className="text-steel" />
          <span className="font-semibold">
            {uploading
              ? `Uploading ${(progress?.done ?? 0) + 1} of ${progress?.total}`
              : 'Add photos'}
          </span>
          {uploading ? (
            progressBar
          ) : (
            <span className="text-[13px] text-ink-muted">or drag them here · {SIZE}</span>
          )}
        </button>
      )}

      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={acceptFor(PRODUCT_IMAGE_FORMATS)}
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = '';
          if (files.length) void addFiles(files);
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this photo?"
        description="It is deleted from image storage and can't be recovered."
        confirmLabel="Remove"
        onConfirm={() => removing && void remove(removing)}
      />
    </PhotoColumn>
  );
}
