import type { OrderMovementView, SaleDraftView, SaleListView, SaleView } from '@printbi/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type SaleQuery = Record<string, string>;

export const saleKeys = {
  all: ['sales'] as const,
  list: (q: SaleQuery) => ['sales', 'list', q] as const,
  one: (id: string) => ['sales', 'one', id] as const,
  movements: (id: string) => ['sales', 'movements', id] as const,
  draft: (q: SaleQuery) => ['sales', 'draft', q] as const,
};

const queryString = (q: SaleQuery) => {
  const text = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '')).toString();
  return text ? `?${text}` : '';
};

export const useSales = (q: SaleQuery, enabled = true) =>
  useQuery({
    queryKey: saleKeys.list(q),
    queryFn: () => api.get<SaleListView>(`/sales${queryString(q)}`),
    placeholderData: (previous) => previous,
    enabled,
  });

export const useSale = (id: string) =>
  useQuery({
    queryKey: saleKeys.one(id),
    queryFn: () => api.get<SaleView>(`/sales/${id}`),
    enabled: Boolean(id),
  });

export const useSaleMovements = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: saleKeys.movements(id),
    queryFn: () => api.get<OrderMovementView[]>(`/sales/${id}/movements`),
    enabled: Boolean(id) && enabled,
  });

export const useSaleDraft = (q: SaleQuery, enabled: boolean) =>
  useQuery({
    queryKey: saleKeys.draft(q),
    queryFn: () => api.get<SaleDraftView>(`/sales/draft${queryString(q)}`),
    enabled,
    staleTime: 0,
  });

/** Sales change orders (payment) and orders change sales (production, cost): refresh both. */
export function useRefreshSales() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: saleKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['orders'] }),
      queryClient.invalidateQueries({ queryKey: ['quotes'] }),
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
    ]);
}
