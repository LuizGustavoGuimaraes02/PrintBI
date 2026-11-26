import { ORDER_PICTURE_MAX_BYTES } from '@printbi/shared';

const LONGEST_SIDE = 400;

const bytesOf = (dataUrl: string) =>
  Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);

/**
 * Shrinks a picture for a card: at most 400 px on its longest side, WebP (JPEG where the
 * browser can't write WebP), lowering the quality until it fits what the API keeps.
 */
export async function shrinkPicture(source: Blob): Promise<string> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot resize pictures.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    let url = canvas.toDataURL('image/webp', quality);
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', quality);
    if (bytesOf(url) <= ORDER_PICTURE_MAX_BYTES) return url;
  }
  throw new Error('This picture is too detailed to keep. Try another one.');
}
