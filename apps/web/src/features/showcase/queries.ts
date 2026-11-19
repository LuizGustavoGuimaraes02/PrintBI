import type {
  PublicCollectionPageView,
  PublicProductView,
  PublicShowcaseView,
} from '@printbi/shared';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';

const options = { announceExpiry: false };
/** A missing page stays missing: don't retry a 404. */
const retry = (count: number, error: Error) =>
  !(error instanceof ApiError && error.status < 500) && count < 2;

export const usePublicShowcase = (slug: string) =>
  useQuery({
    queryKey: ['public', 'showcase', slug],
    queryFn: () =>
      api.get<PublicShowcaseView>(`/public/showcase/${encodeURIComponent(slug)}`, options),
    retry,
    staleTime: 60_000,
  });

export const usePublicProduct = (slug: string, productSlug: string) =>
  useQuery({
    queryKey: ['public', 'showcase', slug, productSlug],
    queryFn: () =>
      api.get<PublicProductView>(
        `/public/showcase/${encodeURIComponent(slug)}/${encodeURIComponent(productSlug)}`,
        options,
      ),
    retry,
    staleTime: 60_000,
  });

export const usePublicCollection = (slug: string, collectionSlug: string) =>
  useQuery({
    queryKey: ['public', 'showcase', slug, 'c', collectionSlug],
    queryFn: () =>
      api.get<PublicCollectionPageView>(
        `/public/showcase/${encodeURIComponent(slug)}/c/${encodeURIComponent(collectionSlug)}`,
        options,
      ),
    retry,
    staleTime: 60_000,
  });
