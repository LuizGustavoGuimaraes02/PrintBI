import type { OrderDraftView, OrderListView, OrderMovementView, OrderView } from '@printbi/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

/** Filters as query-string values, the same names the API reads. */
export type OrderQuery = Record<string, string>;

export const orderKeys = {
  all: ['orders'] as const,
  list: (q: OrderQuery) => ['orders', 'list', q] as const,
  one: (id: string) => ['orders', 'one', id] as const,
  movements: (id: string) => ['orders', 'movements', id] as const,
  draft: (quoteId: string) => ['orders', 'draft', quoteId] as const,
};

const queryString = (q: OrderQuery) => {
  const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== ''));
  const text = params.toString();
  return text ? `?${text}` : '';
};

export const useOrders = (q: OrderQuery) =>
  useQuery({
    queryKey: orderKeys.list(q),
    queryFn: () => api.get<OrderListView>(`/orders${queryString(q)}`),
    placeholderData: (previous) => previous,
  });

export const useOrder = (id: string, today?: string) =>
  useQuery({
    queryKey: orderKeys.one(id),
    queryFn: () => api.get<OrderView>(`/orders/${id}${today ? `?today=${today}` : ''}`),
    enabled: Boolean(id),
  });

export const useOrderMovements = (id: string) =>
  useQuery({
    queryKey: orderKeys.movements(id),
    queryFn: () => api.get<OrderMovementView[]>(`/orders/${id}/movements`),
    enabled: Boolean(id),
  });

export const useOrderDraft = (quoteId: string) =>
  useQuery({
    queryKey: orderKeys.draft(quoteId),
    queryFn: () => api.get<OrderDraftView>(`/orders/from-quote/${quoteId}`),
    enabled: Boolean(quoteId),
  });

/** Orders, plus the stock and quotes an order change can touch. */
export function useRefreshOrders() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orderKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['quotes'] }),
    ]);
}
