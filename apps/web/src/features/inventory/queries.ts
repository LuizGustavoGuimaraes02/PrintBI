import type {
  FilamentProductView,
  InventoryItemView,
  InventorySummaryView,
  StockMovementView,
} from '@printbi/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface ItemFilters {
  kind?: InventoryItemView['kind'] | '';
  stock?: 'low' | 'out' | '';
  archived?: boolean;
  q?: string;
}

const query = (filters: ItemFilters) => {
  const params = new URLSearchParams();
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.stock) params.set('stock', filters.stock);
  if (filters.archived) params.set('archived', 'true');
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  const text = params.toString();
  return text ? `?${text}` : '';
};

export const inventoryKeys = {
  all: ['inventory'] as const,
  items: (filters: ItemFilters) => ['inventory', 'items', filters] as const,
  item: (id: string) => ['inventory', 'item', id] as const,
  movements: (id: string) => ['inventory', 'movements', id] as const,
  summary: ['inventory', 'summary'] as const,
};

export const useInventoryItems = (filters: ItemFilters = {}) =>
  useQuery({
    queryKey: inventoryKeys.items(filters),
    queryFn: () => api.get<InventoryItemView[]>(`/inventory/items${query(filters)}`),
    placeholderData: (previous) => previous,
  });

export const useInventoryItem = (id: string) =>
  useQuery({
    queryKey: inventoryKeys.item(id),
    queryFn: () => api.get<InventoryItemView>(`/inventory/items/${id}`),
  });

export const useMovements = (id: string) =>
  useQuery({
    queryKey: inventoryKeys.movements(id),
    queryFn: () => api.get<StockMovementView[]>(`/inventory/items/${id}/movements`),
  });

export const useInventorySummary = () =>
  useQuery({
    queryKey: inventoryKeys.summary,
    queryFn: () => api.get<InventorySummaryView>('/inventory/summary'),
  });

export const useFilamentProducts = () =>
  useQuery({
    queryKey: ['filament-products'],
    queryFn: () => api.get<FilamentProductView[]>('/filament-products'),
    staleTime: Infinity,
  });

/** Any stock change can affect lists, details, history, summary and linked expenses. */
export function useRefreshInventory() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['expenses'] }),
    ]);
}
