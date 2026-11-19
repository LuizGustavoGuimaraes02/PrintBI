import type { LabelView, ProductType, ProductView } from '@printbi/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface ProductFilters {
  q?: string;
  type?: ProductType | '';
  labelId?: string;
  archived?: boolean;
}

const query = (filters: ProductFilters) => {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.type) params.set('type', filters.type);
  if (filters.labelId) params.set('labelId', filters.labelId);
  if (filters.archived) params.set('archived', 'true');
  const text = params.toString();
  return text ? `?${text}` : '';
};

export const catalogKeys = {
  all: ['catalog'] as const,
  labels: ['catalog', 'labels'] as const,
  products: (filters: ProductFilters) => ['catalog', 'products', filters] as const,
  product: (id: string) => ['catalog', 'product', id] as const,
};

export const useLabels = () =>
  useQuery({ queryKey: catalogKeys.labels, queryFn: () => api.get<LabelView[]>('/labels') });

export const useProducts = (filters: ProductFilters = {}) =>
  useQuery({
    queryKey: catalogKeys.products(filters),
    queryFn: () => api.get<ProductView[]>(`/products${query(filters)}`),
    placeholderData: (previous) => previous,
  });

export const useProduct = (id: string) =>
  useQuery({
    queryKey: catalogKeys.product(id),
    queryFn: () => api.get<ProductView>(`/products/${id}`),
  });

/** Labels, product lists and details all change together. */
export function useRefreshCatalog() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: catalogKeys.all });
}
