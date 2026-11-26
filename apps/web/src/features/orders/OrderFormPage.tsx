import type { OrderView } from '@printbi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Button,
  EmptyState,
  Notice,
  PageHeader,
  PageLoader,
  Panel,
  useToast,
} from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { localToday } from '../../lib/period';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { useSettings } from '../settings/queries';
import { emptyOrder, fromDraft, fromOrder, toPayload, type OrderForm } from './form';
import { OrderSheet } from './OrderSheet';
import { orderKeys, useOrder, useOrderDraft, useRefreshOrders } from './queries';
import { saveErrorFields, savePicture } from './saveOrder';
import { useShowMore } from './showMore';
import { useOrderForm } from './useOrderForm';

export function OrderFormPage() {
  const { orderId = '' } = useParams();
  const [params] = useSearchParams();
  const quoteId = orderId ? '' : (params.get('quote') ?? '');
  const customerId = params.get('customer') ?? '';
  const { data: settings } = useSettings();
  const { data: order, isPending, isError } = useOrder(orderId);
  const draft = useOrderDraft(quoteId);
  const today = localToday();

  if (!settings || (orderId && isPending) || (quoteId && draft.isPending)) {
    return <PageLoader label="Loading the order" />;
  }
  const currency = settings.currency.defaultCurrency;
  if ((orderId && (isError || !order)) || (quoteId && !draft.data)) {
    return (
      <EmptyState
        title={orderId ? 'Order not found' : 'Quote not found'}
        action={
          <Link to="/orders" className="font-semibold text-teal">
            Back to orders
          </Link>
        }
      >
        It may have been deleted.
      </EmptyState>
    );
  }

  if (draft.data) {
    const { quote, existingOrderId } = draft.data;
    if (existingOrderId) {
      return (
        <Blocked title={`${quote.code} already has an order`}>
          One quote makes one order, so nothing is duplicated.{' '}
          <Link to={`/orders?card=${existingOrderId}`} className="font-semibold text-teal">
            Open that order
          </Link>
        </Blocked>
      );
    }
    if (quote.status !== 'approved') {
      return (
        <Blocked title={`${quote.code} is not approved yet`}>
          Mark the quote approved first; approving never creates the order by itself.{' '}
          <Link to={`/quotes/${quote.id}`} className="font-semibold text-teal">
            Open the quote
          </Link>
        </Blocked>
      );
    }
  }

  const initial = order
    ? fromOrder(order, currency)
    : draft.data
      ? fromDraft(draft.data, today, currency)
      : {
          ...emptyOrder(today, currency),
          ...(customerId && { recipientKind: 'customer' as const, customerId }),
        };
  return (
    <OrderEditor
      key={order?.id ?? 'new'}
      order={order}
      initial={initial}
      quoteCode={draft.data?.quote.code}
      today={today}
    />
  );
}

function Blocked({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <BackLink />
      <PageHeader title="New order from a quote" />
      <Notice title={title}>{children}</Notice>
    </>
  );
}

function BackLink() {
  return (
    <Link
      to="/orders"
      className="inline-flex items-center gap-1.5 self-start px-1 text-sm font-semibold text-ink-muted hover:text-ink"
    >
      <ArrowLeft size={16} aria-hidden="true" /> Orders
    </Link>
  );
}

function OrderEditor({
  order,
  initial,
  quoteCode,
  today,
}: {
  order?: OrderView;
  initial: OrderForm;
  quoteCode?: string;
  today: string;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const refresh = useRefreshOrders();
  const state = useOrderForm(initial);
  const { form } = state;
  const [more, setMore] = useShowMore();
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState<'save' | 'another' | null>(null);
  const dirty = JSON.stringify(form) !== saved;
  const { prompt: guard, allowLeave } = useUnsavedChangesGuard(dirty);

  const submit = async (then: 'open' | 'another') => {
    setBusy(then === 'another' ? 'another' : 'save');
    state.setErrors({});
    try {
      const body = toPayload(form);
      const saved = order
        ? await api.put<OrderView>(`/orders/${order.id}`, body)
        : await api.post<OrderView>('/orders', body);
      const result = await savePicture(saved, state.picture).catch(() => {
        toast.error('Picture not kept', 'The order was saved; try the picture again.');
        return saved;
      });
      queryClient.setQueryData(orderKeys.one(result.id), result);
      void refresh();
      setSaved(JSON.stringify(form));
      toast.success(order ? 'Changes saved' : 'Order added', result.title);
      allowLeave();
      if (then === 'another') {
        const fresh = emptyOrder(today, form.currency);
        state.reset(fresh);
        setSaved(JSON.stringify(fresh));
        window.scrollTo({ top: 0 });
      } else {
        void navigate(`/orders?card=${result.id}`);
      }
    } catch (e) {
      const fields = saveErrorFields(e);
      if (fields) {
        state.setErrors(fields.errors);
        if (fields.outsideSummary) setMore(true);
        toast.error('Not saved', 'Check the highlighted fields.');
      } else if (e instanceof ApiError && e.code === 'ORDER_EXISTS') {
        toast.error('Already made', e.message);
      } else {
        toast.error('Not saved', e instanceof ApiError ? e.message : undefined);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {guard}
      <BackLink />
      <PageHeader
        title={order ? 'Edit order' : quoteCode ? `New order from ${quoteCode}` : 'New order'}
      />
      {quoteCode && (
        <Notice title="Prefilled from the quote">Review it, pick a printer, then save.</Notice>
      )}

      <form
        className="flex max-w-2xl flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit('open');
        }}
      >
        <Panel>
          <OrderSheet
            state={state}
            isNew={!order}
            more={more}
            onMore={setMore}
            quoteCode={order?.quote?.code ?? quoteCode}
            existingPicture={order?.pictureUrl ?? null}
          />
        </Panel>

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            variant="ghost"
            onClick={() => void navigate(order ? `/orders?card=${order.id}` : '/orders')}
          >
            Cancel
          </Button>
          {!order && !quoteCode && (
            <Button
              variant="soft"
              loading={busy === 'another'}
              disabled={busy !== null}
              onClick={() => void submit('another')}
            >
              Save &amp; add another
            </Button>
          )}
          <Button type="submit" loading={busy === 'save'} disabled={busy !== null}>
            {order ? 'Save changes' : 'Save order'}
          </Button>
        </div>
      </form>
    </>
  );
}
