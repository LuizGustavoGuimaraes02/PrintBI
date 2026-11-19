import type { CollectionKey } from '@printbi/shared';
import { christmas } from './christmas';
import { easter } from './easter';
import { halloween } from './halloween';
import type { Theme } from './types';
import { valentines } from './valentines';

/** One theme per seasonal collection. A new season is one more file here. */
export const THEMES: Record<CollectionKey, Theme> = { valentines, easter, halloween, christmas };

export type { Theme } from './types';
