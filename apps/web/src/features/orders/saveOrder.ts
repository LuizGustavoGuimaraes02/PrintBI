import type { OrderView } from '@printbi/shared';
import { api, ApiError } from '../../lib/api';
import type { PictureChange } from './useOrderForm';

/** Applies a picture change after the order itself saved; returns the order as it is now. */
export async function savePicture(order: OrderView, change: PictureChange): Promise<OrderView> {
  if (change.kind === 'new') {
    return api.put<OrderView>(`/orders/${order.id}/picture`, { dataUrl: change.dataUrl });
  }
  if (change.kind === 'remove' && order.pictureUrl) {
    return api.delete<OrderView>(`/orders/${order.id}/picture`);
  }
  return order;
}

/** Fields the Summary view shows; an error anywhere else opens Detailed so it can be seen. */
const SUMMARY_FIELDS = new Set([
  'title',
  'type',
  'quantity',
  'dueDate',
  'printerId',
  'recipient.customerId',
  'recipient.name',
  'recipient',
]);

/** Field errors from a rejected save, or null when the failure is not about the fields. */
export function saveErrorFields(
  error: unknown,
): { errors: Record<string, string>; outsideSummary: boolean } | null {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return null;
  const errors = error.fieldErrors();
  return { errors, outsideSummary: Object.keys(errors).some((key) => !SUMMARY_FIELDS.has(key)) };
}
