import type { ImageView } from '@printbi/shared';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env';
import { AppError } from '../errors';
import { logger } from '../logger';

/**
 * Minimal Cloudinary client: signed browser uploads, resource lookup and deletion over its
 * HTTP API. Uploads go straight from the browser to Cloudinary; the API only signs them and
 * then confirms what was stored before linking it to a record.
 */

export const uploadsEnabled = () => env.CLOUDINARY_URL !== null;

export function cloudinaryConfig() {
  if (!env.CLOUDINARY_URL) {
    throw new AppError(503, 'UPLOADS_NOT_CONFIGURED', 'Image uploads are not set up on the server');
  }
  return env.CLOUDINARY_URL;
}

/** Cloudinary's signature: sorted `key=value` pairs joined by `&`, plus the secret, SHA-1. */
export function sign(params: Record<string, string | number>, secret: string): string {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1')
    .update(payload + secret)
    .digest('hex');
}

/** A fresh, unguessable public id inside the company's folder. */
export const newPublicId = (folder: string) => `${folder}/${randomBytes(12).toString('hex')}`;

/** Fields for one browser upload to exactly `publicId`, limited to `formats`. */
export function signUpload(publicId: string, formats: readonly string[]) {
  const { apiKey, apiSecret, cloudName } = cloudinaryConfig();
  const params = {
    public_id: publicId,
    timestamp: Math.floor(Date.now() / 1000),
    allowed_formats: formats.join(','),
  };
  return {
    uploadUrl: `${env.CLOUDINARY_API_BASE}/v1_1/${cloudName}/image/upload`,
    fields: {
      api_key: apiKey,
      public_id: params.public_id,
      timestamp: String(params.timestamp),
      allowed_formats: params.allowed_formats,
      signature: sign(params, apiSecret),
    },
  };
}

export interface StoredImage {
  publicId: string;
  version: number;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

/** What Cloudinary actually stored under `publicId`, or null when nothing was uploaded. */
export async function findImage(publicId: string): Promise<StoredImage | null> {
  const { apiKey, apiSecret, cloudName } = cloudinaryConfig();
  const res = await fetch(
    `${env.CLOUDINARY_API_BASE}/v1_1/${cloudName}/resources/image/upload/${publicId}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new AppError(502, 'UPLOAD_CHECK_FAILED', 'Could not check the image upload');
  const body = (await res.json()) as {
    public_id: string;
    version: number;
    width: number;
    height: number;
    format: string;
    bytes: number;
  };
  return {
    publicId: body.public_id,
    version: body.version,
    width: body.width,
    height: body.height,
    format: body.format,
    bytes: body.bytes,
  };
}

/**
 * Deletes an image and clears it from the CDN. Failures are logged, not thrown: the record
 * is already unlinked, and a leftover file costs storage but never shows anywhere.
 */
export async function deleteImage(publicId: string): Promise<void> {
  try {
    const { apiKey, apiSecret, cloudName } = cloudinaryConfig();
    const params = {
      public_id: publicId,
      timestamp: Math.floor(Date.now() / 1000),
      invalidate: 'true',
    };
    const form = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      api_key: apiKey,
      signature: sign(params, apiSecret),
    });
    const res = await fetch(`${env.CLOUDINARY_API_BASE}/v1_1/${cloudName}/image/destroy`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (error) {
    logger.warn({ publicId, err: error }, 'Could not delete image from Cloudinary');
  }
}

interface ImageRecord {
  _id: { toString(): string };
  publicId: string;
  version: number;
  width: number;
  height: number;
  alt?: string | null;
}

/** Delivery URLs with on-the-fly resizing; `f_auto,q_auto` serves WebP/AVIF where supported. */
export function imageView(image: ImageRecord): ImageView {
  const cloudName = env.CLOUDINARY_URL?.cloudName ?? 'unconfigured';
  const url = (transform: string) =>
    `${env.CLOUDINARY_DELIVERY_BASE}/${cloudName}/image/upload/${transform}/v${image.version}/${image.publicId}`;
  return {
    id: image._id.toString(),
    width: image.width,
    height: image.height,
    alt: image.alt ?? '',
    urls: {
      thumb: url('c_fill,g_auto,w_400,h_400,f_auto,q_auto'),
      card: url('c_fill,g_auto,w_800,h_800,f_auto,q_auto'),
      full: url('c_limit,w_1600,h_1600,f_auto,q_auto'),
    },
  };
}
