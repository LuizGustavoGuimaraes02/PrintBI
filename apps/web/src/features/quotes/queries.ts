import type { QuoteDisplayStatus, QuoteListView, QuoteView } from '@printbi/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface QuoteFilters {
  q?: string;
  status?: QuoteDisplayStatus | '';
}

export const quoteKeys = {
  all: ['quotes'] as const,
  list: (f: QuoteFilters) => ['quotes', 'list', f] as const,
  one: (id: string) => ['quotes', 'one', id] as const,
};

export const useQuotes = (filters: QuoteFilters) =>
  useQuery({
    queryKey: quoteKeys.list(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.q?.trim()) params.set('q', filters.q.trim());
      if (filters.status) params.set('status', filters.status);
      const text = params.toString();
      return api.get<QuoteListView>(`/quotes${text ? `?${text}` : ''}`);
    },
    placeholderData: (previous) => previous,
  });

export const useQuote = (id: string) =>
  useQuery({
    queryKey: quoteKeys.one(id),
    queryFn: () => api.get<QuoteView>(`/quotes/${id}`),
    enabled: Boolean(id),
  });

export function useRefreshQuotes() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: quoteKeys.all });
}

export const STATUS_BADGE: Record<
  QuoteDisplayStatus,
  { label: string; tone: 'teal' | 'neutral' | 'hot' }
> = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'teal' },
  approved: { label: 'Approved', tone: 'teal' },
  rejected: { label: 'Rejected', tone: 'hot' },
  expired: { label: 'Expired', tone: 'hot' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
