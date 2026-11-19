import type { CustomerSourceView, CustomerView } from '@printbi/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface CustomerFilters {
  q?: string;
  /** A source id, or "none" for customers without one. */
  sourceId?: string;
  archived?: boolean;
}

const query = (filters: CustomerFilters) => {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.sourceId) params.set('sourceId', filters.sourceId);
  if (filters.archived) params.set('archived', 'true');
  const text = params.toString();
  return text ? `?${text}` : '';
};

export const customerKeys = {
  all: ['customers'] as const,
  list: (filters: CustomerFilters) => ['customers', 'list', filters] as const,
  one: (id: string) => ['customers', 'one', id] as const,
  sources: ['customers', 'sources'] as const,
};

export const useCustomers = (filters: CustomerFilters = {}) =>
  useQuery({
    queryKey: customerKeys.list(filters),
    queryFn: () => api.get<CustomerView[]>(`/customers${query(filters)}`),
    placeholderData: (previous) => previous,
  });

export const useCustomer = (id: string) =>
  useQuery({
    queryKey: customerKeys.one(id),
    queryFn: () => api.get<CustomerView>(`/customers/${id}`),
  });

export const useCustomerSources = () =>
  useQuery({
    queryKey: customerKeys.sources,
    queryFn: () => api.get<CustomerSourceView[]>('/customer-sources'),
  });

/** Lists, details and source counts change together. */
export function useRefreshCustomers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: customerKeys.all });
}

/** Digits for a wa.me link; numbers without a country code are left as typed. */
export const whatsappLink = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
};
