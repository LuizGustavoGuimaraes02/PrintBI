import type { CompanySettingsView, updateSettingsSchema } from '@printbi/shared';
import type { z } from 'zod';
import { api } from '../../lib/api';
import { companyBase, keys, useSaving } from './queries';

type SectionInput = z.input<typeof updateSettingsSchema>;

/** Saves one settings section (currency, calculator, reminders or board). */
export function useSaveSettings(successTitle: string) {
  return useSaving(
    (input: SectionInput) => api.patch<CompanySettingsView>(`${companyBase}/settings`, input),
    [keys.settings],
    successTitle,
  );
}

/** Empty form fields become null for optional values. */
export const emptyToNull = (value: unknown) => (value === '' ? null : value);
