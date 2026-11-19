import type { PublicCollectionPageView } from '@printbi/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api, ApiError } from '../../lib/api';
import { CollectionPageView } from './CollectionPage';
import { PublicLoading, PublicNotFound } from './PublicLayout';

/** The admin's preview of a seasonal page, even while it is hidden from visitors. */
export function CollectionPreviewPage() {
  const { key = '' } = useParams();
  const { data, error, isPending } = useQuery({
    queryKey: ['showcase', 'collections', key, 'preview'],
    queryFn: () =>
      api.get<PublicCollectionPageView>(`/companies/current/showcase/collections/${key}/preview`),
    retry: false,
  });
  if (isPending) return <PublicLoading />;
  if (error || !data) {
    const forbidden = error instanceof ApiError && error.status === 403;
    return (
      <PublicNotFound
        message={forbidden ? 'Only an admin can preview seasonal pages.' : error?.message}
      />
    );
  }
  return <CollectionPageView data={data} />;
}
