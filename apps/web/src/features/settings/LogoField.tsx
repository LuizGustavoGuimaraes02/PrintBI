import { LOGO_FORMATS, LOGO_MAX_BYTES, type CompanyView } from '@printbi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Button, ImageSlot, useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { acceptFor, checkFile, uploadImage, UploadError, useUploadConfig } from '../../lib/uploads';
import { useCan } from '../auth/account';
import { keys } from './queries';

const SLOT = { label: 'Logo', size: '512 × 512', formats: 'PNG, SVG or WebP · up to 1 MB' };

/** The business logo: shown on the showcase header (and later on quotes). Saves on upload. */
export function LogoField({ company }: { company: CompanyView }) {
  const canManage = useCan('settings:manage');
  const { data: config } = useUploadConfig();
  const queryClient = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const done = (saved: CompanyView, title: string) => {
    queryClient.setQueryData(keys.company, saved);
    toast.success(title);
  };

  const upload = async (file: File) => {
    const problem = checkFile(file, LOGO_FORMATS, LOGO_MAX_BYTES);
    if (problem) {
      toast.error('Logo not changed', problem);
      return;
    }
    setBusy(true);
    try {
      const publicId = await uploadImage({ target: 'logo' }, file);
      done(await api.post<CompanyView>('/companies/current/logo', { publicId }), 'Logo saved');
    } catch (error) {
      toast.error(
        'Logo not changed',
        error instanceof ApiError || error instanceof UploadError ? error.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      done(await api.delete<CompanyView>('/companies/current/logo'), 'Logo removed');
    } catch (error) {
      toast.error('Not removed', error instanceof ApiError ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const enabled = config?.enabled ?? false;

  return (
    <div className="flex flex-col gap-2">
      {company.logo ? (
        <>
          <span className="label-mono text-ink-muted">{SLOT.label}</span>
          <div className="flex size-40 items-center justify-center rounded-[var(--radius-tile)] border border-rule-soft bg-[repeating-conic-gradient(#f3f8f9_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-3">
            <img
              src={company.logo.urls.full}
              alt={`${company.name} logo`}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <span className="text-xs text-ink-muted">
            {SLOT.size} · {SLOT.formats}
          </span>
        </>
      ) : (
        <ImageSlot {...SLOT}>
          {!enabled && config && (
            <p className="max-w-56 text-xs text-ink-muted">
              Image storage is not set up on the server yet (CLOUDINARY_URL).
            </p>
          )}
        </ImageSlot>
      )}
      {canManage && enabled && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="soft" loading={busy} onClick={() => input.current?.click()}>
            {company.logo ? 'Replace' : 'Upload logo'}
          </Button>
          {company.logo && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove()}>
              Remove
            </Button>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept={acceptFor(LOGO_FORMATS)}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
