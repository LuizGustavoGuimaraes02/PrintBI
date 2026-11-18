import { ImageIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface ImageSlotProps {
  label: string;
  /** Recommended size, e.g. "512 × 512". */
  size: string;
  formats: string;
  /** Aspect ratio of the preview box, e.g. "1 / 1" or "3 / 1". */
  aspect?: string;
  children?: ReactNode;
}

/**
 * A reserved place for artwork the business uploads itself. It always states the
 * recommended size and formats, so the space never looks broken while empty.
 */
export function ImageSlot({ label, size, formats, aspect = '1 / 1', children }: ImageSlotProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label-mono text-ink-muted">{label}</span>
      <div
        className="flex w-full max-w-56 flex-col items-center justify-center gap-2 rounded-[var(--radius-tile)] border-2 border-dashed border-rule bg-bench p-4 text-center"
        style={{ aspectRatio: aspect }}
      >
        <ImageIcon size={28} strokeWidth={1.5} aria-hidden="true" className="text-steel" />
        <span className="figure text-[13px]">{size}</span>
        <span className="text-xs text-ink-muted">{formats}</span>
      </div>
      {children}
    </div>
  );
}
