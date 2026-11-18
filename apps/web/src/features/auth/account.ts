import type { AccountView, Permission } from '@printbi/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, ApiError } from '../../lib/api';

export const accountKey = ['account'] as const;

/** The signed-in account, or null when nobody is signed in. */
export function useAccount() {
  return useQuery({
    queryKey: accountKey,
    queryFn: async () => {
      try {
        return await api.get<AccountView>('/auth/me', { announceExpiry: false });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

/** Stores a fresh account view returned by sign-in, company switch and so on. */
export function useSetAccount() {
  const queryClient = useQueryClient();
  return useCallback(
    (account: AccountView | null) => {
      if (account === null) {
        queryClient.clear();
      } else {
        // Another company may now be active: drop everything company-scoped.
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== accountKey[0] });
      }
      queryClient.setQueryData(accountKey, account);
    },
    [queryClient],
  );
}

export function useCan(permission: Permission): boolean {
  const { data } = useAccount();
  return Boolean(data?.activeCompany?.permissions.includes(permission));
}
