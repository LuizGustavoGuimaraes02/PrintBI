import { findColor, type FilamentColor, type FilamentSpecView } from '@printbi/shared';
import type { CSSProperties } from 'react';
import { cn } from './cn';

/** The color stops of a filament: from the catalog, or its custom hex. */
export function filamentStops(
  filament: Pick<FilamentSpecView, 'colorKey' | 'colorHex'> | null | undefined,
): string[] {
  const color = findColor(filament?.colorKey);
  if (color) return color.stops;
  return [filament?.colorHex ?? '#8E9399'];
}

export function filamentFinish(
  filament: Pick<FilamentSpecView, 'colorKey'> | null | undefined,
): FilamentColor['finish'] {
  return findColor(filament?.colorKey)?.finish ?? 'basic';
}

/** CSS background for a swatch: gradients for multi-color, a sheen for silk and metallic. */
export function swatchBackground(
  stops: string[],
  finish: FilamentColor['finish'] = 'basic',
): string {
  const base =
    stops.length > 1 ? `linear-gradient(135deg, ${stops.join(', ')})` : (stops[0] ?? '#8E9399');
  if (finish === 'silk' || finish === 'metallic') {
    return `linear-gradient(135deg, rgb(255 255 255 / 0.45) 0%, rgb(255 255 255 / 0) 45%, rgb(0 0 0 / 0.18) 100%), ${base}`;
  }
  if (finish === 'sparkle') {
    return `radial-gradient(circle at 30% 30%, rgb(255 255 255 / 0.7) 0 1px, transparent 2px), radial-gradient(circle at 70% 60%, rgb(255 255 255 / 0.6) 0 1px, transparent 2px), ${base}`;
  }
  return base;
}

interface ColorSwatchProps {
  stops: string[];
  finish?: FilamentColor['finish'];
  size?: number;
  label?: string;
  className?: string;
}

/** A round sample of a filament color. Decorative unless given a label. */
export function ColorSwatch({
  stops,
  finish = 'basic',
  size = 22,
  label,
  className,
}: ColorSwatchProps) {
  const translucent = finish === 'translucent';
  const style: CSSProperties = {
    width: size,
    height: size,
    background: swatchBackground(stops, finish),
    opacity: translucent ? 0.75 : 1,
  };
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-block shrink-0 rounded-full border border-black/10', className)}
      style={style}
    />
  );
}
