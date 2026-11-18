import type {
  CategoryView,
  CompanySettingsView,
  CompanyView,
  InviteView,
  MemberView,
  PrinterModelView,
  PrinterView,
} from '@printbi/shared';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';

const base = '/companies/current';

export const keys = {
  company: ['company'] as const,
  settings: ['settings'] as const,
  members: ['members'] as const,
  invites: ['invites'] as const,
  printers: ['printers'] as const,
  categories: ['categories'] as const,
  printerModels: ['printer-models'] as const,
};

export const useCompany = () =>
  useQuery({ queryKey: keys.company, queryFn: () => api.get<CompanyView>(base) });
export const useSettings = () =>
  useQuery({
    queryKey: keys.settings,
    queryFn: () => api.get<CompanySettingsView>(`${base}/settings`),
  });
export const useMembers = () =>
  useQuery({ queryKey: keys.members, queryFn: () => api.get<MemberView[]>(`${base}/members`) });
export const usePrinters = () =>
  useQuery({ queryKey: keys.printers, queryFn: () => api.get<PrinterView[]>(`${base}/printers`) });
/** The FDM catalog changes only with a new build: fetch it once per session. */
export const usePrinterModels = () =>
  useQuery({
    queryKey: keys.printerModels,
    queryFn: () => api.get<PrinterModelView[]>('/printer-models'),
    staleTime: Infinity,
  });
export const useCategories = () =>
  useQuery({
    queryKey: keys.categories,
    queryFn: () => api.get<CategoryView[]>(`${base}/expense-categories`),
  });
export const useInvites = (enabled: boolean) =>
  useQuery({
    queryKey: keys.invites,
    queryFn: () => api.get<InviteView[]>(`${base}/invites`),
    enabled,
  });

/**
 * A mutation that refreshes the given queries and reports the outcome in a toast.
 * Validation errors are left to the form (rethrown), other errors are toasted.
 */
export function useSaving<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  invalidate: QueryKey[],
  successTitle: string,
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.success(successTitle);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') return;
      toast.error(
        'Not saved',
        error instanceof ApiError ? error.message : 'Check your connection and try again.',
      );
    },
  });
}

export { base as companyBase };
