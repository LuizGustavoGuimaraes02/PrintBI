import type { ExpenseStatus, ExpenseSummaryView, ExpenseView } from '@printbi/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { rangeQuery, type Range } from '../../lib/period';

export interface ExpenseFilters extends Range {
  categoryId?: string;
  status?: ExpenseStatus | '';
  q?: string;
}

export function useExpenses(filters: ExpenseFilters, enabled = true) {
  const params = rangeQuery(filters);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.status) params.set('status', filters.status);
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  return useQuery({
    queryKey: ['expenses', 'list', filters],
    queryFn: () => api.get<ExpenseView[]>(`/expenses?${params.toString()}`),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export const useExpenseSummary = (range: Range, enabled = true) =>
  useQuery({
    queryKey: ['expenses', 'summary', range],
    queryFn: () => api.get<ExpenseSummaryView>(`/expenses/summary?${rangeQuery(range).toString()}`),
    enabled,
  });

export const useExpense = (id: string) =>
  useQuery({
    queryKey: ['expenses', 'one', id],
    queryFn: () => api.get<ExpenseView>(`/expenses/${id}`),
  });

export function useRefreshExpenses() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['expenses'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory'] }),
    ]);
}
