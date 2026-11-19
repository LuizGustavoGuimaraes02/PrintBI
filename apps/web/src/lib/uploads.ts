import type { SignUploadInput, UploadConfigView, UploadSignatureView } from '@printbi/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Whether the server has image storage set up; asked once per session. */
export const useUploadConfig = () =>
  useQuery({
    queryKey: ['uploads', 'config'],
    queryFn: () => api.get<UploadConfigView>('/uploads/config'),
    staleTime: Infinity,
  });

export class UploadError extends Error {
  override name = 'UploadError';
}

const EXTENSIONS: Record<string, string[]> = {
  jpg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  svg: ['image/svg+xml'],
};

/** The `accept` attribute for a file input that takes these formats. */
export const acceptFor = (formats: readonly string[]) =>
  formats.flatMap((f) => EXTENSIONS[f] ?? []).join(',');

const megabytes = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

/** Same checks the server makes afterwards, so a wrong file fails before it is sent. */
export function checkFile(file: File, formats: readonly string[], maxBytes: number): string | null {
  const allowed = formats.flatMap((f) => EXTENSIONS[f] ?? []);
  if (!allowed.includes(file.type)) {
    return `${file.name}: use ${formats.map((f) => f.toUpperCase()).join(', ')}`;
  }
  if (file.size > maxBytes) return `${file.name} is over ${megabytes(maxBytes)}`;
  return null;
}

/** Posts the file to Cloudinary with the signed fields, reporting progress from 0 to 1. */
function send(file: File, signed: UploadSignatureView, onProgress?: (share: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(signed.fields)) form.append(key, value);
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', signed.uploadUrl);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new UploadError(`${file.name} was not accepted by image storage`));
    xhr.onerror = () => reject(new UploadError('Upload failed. Check your connection.'));
    xhr.send(form);
  });
}

/**
 * Uploads one image: the API signs it, the browser sends it straight to Cloudinary, and the
 * returned id is then registered with the record (product photo or logo).
 */
export async function uploadImage(
  target: SignUploadInput,
  file: File,
  onProgress?: (share: number) => void,
): Promise<string> {
  const signed = await api.post<UploadSignatureView>('/uploads/sign', target);
  const problem = checkFile(file, signed.formats, signed.maxBytes);
  if (problem) throw new UploadError(problem);
  await send(file, signed, onProgress);
  return signed.publicId;
}
