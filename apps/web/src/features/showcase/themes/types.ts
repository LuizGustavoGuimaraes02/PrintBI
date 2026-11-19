import type { CollectionKey, LocalizedText } from '@printbi/shared';
import type { CSSProperties, ReactNode } from 'react';

/**
 * A seasonal theme: everything that changes on a collection's page. Colors are CSS variables
 * (`--t-*`) set on the page root, so components stay the same for every season.
 */
export interface Theme {
  key: CollectionKey;
  /** Loads the accent font the first time the theme shows (each font is its own chunk). */
  loadFont: () => Promise<unknown>;
  /** Headings: the accent font. */
  heading: CSSProperties;
  dark: boolean;
  vars: ThemeVars;
  /** The hero illustration, drawn in a 1280 × 560 frame, its subject on the right. */
  Illustration: () => ReactNode;
  /** Gentle motion over the hero (snow, hearts...). Stopped for reduced motion. */
  Effects: () => ReactNode;
  /** Closing band under the products, in both languages. */
  strip: { title: LocalizedText; text: LocalizedText };
  StripMark: () => ReactNode;
}

export interface ThemeVars {
  '--t-bg': string;
  '--t-ink': string;
  '--t-muted': string;
  '--t-line': string;
  '--t-header': string;
  '--t-hero': string;
  '--t-hero-ink': string;
  '--t-hero-muted': string;
  '--t-eyebrow': string;
  '--t-heading': string;
  '--t-accent': string;
  '--t-on-accent': string;
  '--t-hero-cta': string;
  '--t-on-hero-cta': string;
  '--t-card': string;
  '--t-card-line': string;
  '--t-media': string;
  '--t-price': string;
  '--t-badge': string;
  '--t-on-badge': string;
  '--t-wa': string;
  '--t-on-wa': string;
  '--t-wa-ring': string;
}

/** Positions for drifting particles, spread across the hero. */
export const spread = (count: number, width = 1280) =>
  Array.from({ length: count }, (_, i) => ({
    left: Math.round(((i * 0.618034) % 1) * (width - 40)) + 20,
    delay: -((i * 1.37) % 10),
    duration: 8 + (i % 6) * 1.4,
    size: i % 4,
  }));
