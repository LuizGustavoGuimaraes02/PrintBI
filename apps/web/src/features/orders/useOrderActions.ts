import type {
  BlockReason,
  OrderListView,
  OrderStatus,
  OrderView,
  PaymentStatus,
} from '@printbi/shared';
import { rankBetween } from '@printbi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { localToday } from '../../lib/period';
import { BLOCK_LABEL, STATUS_LABEL } from './labels';
import { orderKeys, useRefreshOrders } from './queries';

export interface MoveRequest {
  status: OrderStatus;
  /** The card above the new spot; null for the top; undefined to let the deadline decide. */
  afterId?: string | null;
  note?: string;
}

/** Board actions with their messages. Each one refreshes the board and the card. */
export function useOrderActions() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const refresh = useRefreshOrders();
  const fail = (title: string, error: unknown) =>
    toast.error(title, error instanceof ApiError ? error.message : 'Could not reach the server.');

  const store = async (order: OrderView) => {
    queryClient.setQueryData(orderKeys.one(order.id), order);
    await refresh();
  };

  /** Shows the card in its new place at once, then saves; a failure puts it back. */
  const optimistic = (id: string, request: MoveRequest) => {
    const lists = queryClient.getQueriesData<OrderListView>({ queryKey: ['orders', 'list'] });
    for (const [key, data] of lists) {
      if (!data) continue;
      const after = request.afterId ? data.orders.find((o) => o.id === request.afterId) : null;
      const column = data.orders
        .filter((o) => o.status === request.status && o.id !== id)
        .sort((a, b) => (a.rank < b.rank ? -1 : 1));
      const next =
        request.afterId === undefined
          ? undefined
          : request.afterId === null
            ? column[0]
            : column[column.findIndex((o) => o.id === request.afterId) + 1];
      const rank =
        request.afterId === undefined
          ? undefined
          : rankBetween(after?.rank ?? null, next?.rank ?? null);
      queryClient.setQueryData<OrderListView>(key, {
        ...data,
        orders: data.orders
          .map((o) =>
            o.id === id ? { ...o, status: request.status, ...(rank !== undefined && { rank }) } : o,
          )
          .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0)),
      });
    }
    return () => lists.forEach(([key, data]) => queryClient.setQueryData(key, data));
  };

  const move = async (id: string, request: MoveRequest, silent = false) => {
    const undo = optimistic(id, request);
    try {
      const order = await api.post<OrderView>(`/orders/${id}/move?today=${localToday()}`, {
        status: request.status,
        ...(request.afterId !== undefined && { afterId: request.afterId }),
        note: request.note ?? '',
      });
      await store(order);
      if (!silent) toast.success(`Moved to ${STATUS_LABEL[order.status]}`, order.title);
      return order;
    } catch (error) {
      undo();
      fail('Not moved', error);
      await refresh();
      return null;
    }
  };

  const remind = async (
    id: string,
    body: { action: 'contacted' } | { action: 'snooze'; days: number } | { action: 'unsnooze' },
  ) => {
    try {
      const order = await api.post<OrderView>(`/orders/${id}/reminder`, body);
      await store(order);
      toast.success(
        body.action === 'contacted'
          ? 'Marked as contacted'
          : body.action === 'snooze'
            ? `Reminder snoozed for ${body.days} days`
            : 'Reminder back on',
        order.title,
      );
    } catch (error) {
      fail('Not saved', error);
    }
  };

  const setPayment = async (id: string, paymentStatus: PaymentStatus) => {
    try {
      await store(await api.patch<OrderView>(`/orders/${id}/payment`, { paymentStatus }));
      toast.success('Payment updated');
    } catch (error) {
      fail('Not saved', error);
    }
  };

  /** Flags the card as waiting for something, or clears the flag (null). */
  const hold = async (id: string, blocked: { reason: BlockReason; note: string } | null) => {
    try {
      const order = await api.patch<OrderView>(`/orders/${id}/hold`, { blocked });
      await store(order);
      toast.success(blocked ? BLOCK_LABEL[blocked.reason] : 'Not waiting any more', order.title);
    } catch (error) {
      fail('Not saved', error);
    }
  };

  const remove = async (order: OrderView) => {
    try {
      await api.delete(`/orders/${order.id}`);
      queryClient.removeQueries({ queryKey: orderKeys.one(order.id) });
      await refresh();
      toast.success('Order deleted', order.title);
    } catch (error) {
      fail('Not deleted', error);
      throw error;
    }
  };

  return { move, remind, setPayment, hold, remove };
}
