import {
  LOGO_FORMATS,
  LOGO_MAX_BYTES,
  PRODUCT_IMAGE_FORMATS,
  PRODUCT_IMAGE_MAX_BYTES,
  type UploadSignatureView,
} from '@printbi/shared';
import { createHmac } from 'node:crypto';
import type { Types } from 'mongoose';
import { AppError, ValidationError } from '../errors';
import {
  cloudinaryConfig,
  deleteImage,
  findImage,
  newPublicId,
  signUpload,
  type StoredImage,
} from './cloudinary';

/**
 * Folder names stand in for internal ids: image URLs are public, so they must not reveal a
 * company or product id. A keyed hash keeps each name stable and checkable on the server
 * while telling visitors nothing.
 */
export function folderKey(id: Types.ObjectId): string {
  return createHmac('sha256', cloudinaryConfig().apiSecret)
    .update(`printbi-folder:${id.toString()}`)
    .digest('hex')
    .slice(0, 20);
}

/** Where each kind of image lives. Every company has its own folder: printbi/<company key>/. */
export interface UploadRule {
  folder: string;
  formats: readonly string[];
  maxBytes: number;
}

export const productImageRule = (
  companyId: Types.ObjectId,
  productId: Types.ObjectId,
): UploadRule => ({
  folder: `printbi/${folderKey(companyId)}/products/${folderKey(productId)}`,
  formats: PRODUCT_IMAGE_FORMATS,
  maxBytes: PRODUCT_IMAGE_MAX_BYTES,
});

export const logoRule = (companyId: Types.ObjectId): UploadRule => ({
  folder: `printbi/${folderKey(companyId)}/logo`,
  formats: LOGO_FORMATS,
  maxBytes: LOGO_MAX_BYTES,
});

export function signFor(rule: UploadRule): UploadSignatureView {
  const publicId = newPublicId(rule.folder);
  const { uploadUrl, fields } = signUpload(publicId, rule.formats);
  return { uploadUrl, publicId, fields, maxBytes: rule.maxBytes, formats: rule.formats };
}

const megabytes = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

/**
 * Confirms an upload before it is linked to a record: the id must sit in the company's folder
 * for this kind of image, and the stored file must have an allowed format and size. A file that
 * breaks the rules is deleted, so it never lingers on the account.
 */
export async function confirmUpload(publicId: string, rule: UploadRule): Promise<StoredImage> {
  if (!publicId.startsWith(`${rule.folder}/`) || publicId.includes('..')) {
    throw new ValidationError('This image does not belong here', [
      { path: 'publicId', message: 'This image does not belong here' },
    ]);
  }
  const stored = await findImage(publicId);
  if (!stored) {
    throw new AppError(404, 'UPLOAD_NOT_FOUND', 'The upload did not finish. Try again.');
  }
  const problem = !rule.formats.includes(stored.format)
    ? `Use ${rule.formats.map((f) => f.toUpperCase()).join(', ')}`
    : stored.bytes > rule.maxBytes
      ? `The image must be ${megabytes(rule.maxBytes)} or smaller`
      : null;
  if (problem) {
    await deleteImage(publicId);
    throw new ValidationError(problem, [{ path: 'publicId', message: problem }]);
  }
  return stored;
}
