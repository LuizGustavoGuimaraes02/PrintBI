import type { CalculationSummaryView, CalculationView } from '@printbi/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const calculationKeys = {
  all: ['calculations'] as const,
  list: (q: string) => ['calculations', 'list', q] as const,
  one: (id: string) => ['calculations', 'one', id] as const,
};

export const useCalculations = (q = '') =>
  useQuery({
    queryKey: calculationKeys.list(q),
    queryFn: () =>
      api.get<CalculationSummaryView[]>(
        `/calculations${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
      ),
    placeholderData: (previous) => previous,
  });

export const useCalculation = (id: string) =>
  useQuery({
    queryKey: calculationKeys.one(id),
    queryFn: () => api.get<CalculationView>(`/calculations/${id}`),
    enabled: Boolean(id),
  });

export function useRefreshCalculations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: calculationKeys.all });
}
