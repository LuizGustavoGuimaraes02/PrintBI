import { BOARD_COLUMNS, type BoardColumn, type Currency, type OrderView } from '@printbi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useId, useState } from 'react';
import { Button, ConfirmDialog, useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { localToday } from '../../lib/period';
import { useSettings } from '../settings/queries';
import { emptyOrder, toPayload, type OrderForm } from './form';
import { STATUS_LABEL } from './labels';
import { OrderSheet } from './OrderSheet';
import { orderKeys, useRefreshOrders } from './queries';
import { saveErrorFields, savePicture } from './saveOrder';
import { useShowMore } from './showMore';
import { useOrderForm } from './useOrderForm';

/** A new order in a centered window over the board, straight into the column it came from. */
export function NewOrderDialog({ status, onClose }: { status: BoardColumn; onClose: () => void }) {
  const { data: settings } = useSettings();
  if (!settings) return null;
  return (
    <NewOrder
      status={status}
      currency={settings.currency.defaultCurrency}
      today={localToday()}
      onClose={onClose}
    />
  );
}

function NewOrder({
  status,
  currency,
  today,
  onClose,
}: {
  status: BoardColumn;
  currency: Currency;
  today: string;
  onClose: () => void;
}) {
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const refresh = useRefreshOrders();
  const fresh = (column: BoardColumn): OrderForm => ({
    ...emptyOrder(today, currency),
    status: column,
  });
  const [initial, setInitial] = useState(() => fresh(status));
  const state = useOrderForm(initial);
  const [more, setMore] = useShowMore();
  const [another, setAnother] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty =
    JSON.stringify({ ...state.form, status: '' }) !== JSON.stringify({ ...initial, status: '' });
  const requestClose = () => (dirty ? setConfirmClose(true) : onClose());

  const save = async () => {
    setBusy(true);
    state.setErrors({});
    try {
      const created = await api.post<OrderView>('/orders', toPayload(state.form));
      const result = await savePicture(created, state.picture).catch(() => {
        toast.error('Picture not kept', 'The order was added; add the picture again from Edit.');
        return created;
      });
      queryClient.setQueryData(orderKeys.one(result.id), result);
      void refresh();
      toast.success(`Added to ${STATUS_LABEL[result.status]}`, result.title);
      if (another) {
        const next = fresh(state.form.status);
        setInitial(next);
        state.reset(next);
      } else {
        onClose();
      }
    } catch (e) {
      const fields = saveErrorFields(e);
      if (fields) {
        state.setErrors(fields.errors);
        if (fields.outsideSummary) setMore(true);
        toast.error('Not added', 'Check the highlighted fields.');
      } else {
        toast.error('Not added', e instanceof ApiError ? e.message : undefined);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog.Root open onOpenChange={(open) => !open && requestClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 motion-safe:animate-fade-in" />
          <Dialog.Content className="fixed top-2 left-1/2 z-50 flex max-h-[calc(100dvh-16px)] w-[calc(100vw-16px)] max-w-[640px] -translate-x-1/2 flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-pop)] outline-none motion-safe:animate-pop-in sm:top-12 sm:max-h-[calc(100dvh-96px)]">
            <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6">
              <Dialog.Title className="sr-only">New order</Dialog.Title>
              <Dialog.Description className="sr-only">
                Fill in what matters; everything else can wait.
              </Dialog.Description>
              <label className="relative inline-flex h-8 items-center rounded-full bg-bench pr-8 pl-3 text-[13px] font-bold">
                New order in
                <select
                  value={state.form.status}
                  onChange={(e) => state.set('status', e.target.value as BoardColumn)}
                  className="cursor-pointer appearance-none bg-transparent pl-1 font-bold outline-none"
                >
                  {BOARD_COLUMNS.map((c) => (
                    <option key={c} value={c}>
                      {STATUS_LABEL[c]}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 text-ink-muted"
                />
              </label>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="grid size-9 place-items-center rounded-full text-ink-muted hover:bg-bench hover:text-ink"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </header>

            <form
              id={formId}
              className="min-h-0 flex-1 overflow-y-auto px-2 pt-3 pb-4 sm:px-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <OrderSheet state={state} isNew more={more} onMore={setMore} />
            </form>

            <footer className="flex flex-wrap items-center gap-3 border-t border-rule px-4 py-3 sm:px-6">
              <label className="inline-flex items-center gap-2 text-[14px] text-ink-muted">
                <input
                  type="checkbox"
                  checked={another}
                  onChange={(e) => setAnother(e.target.checked)}
                  className="size-4 accent-[var(--color-teal)]"
                />
                Add another after this
              </label>
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" onClick={requestClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form={formId}
                  loading={busy}
                  hint="Puts it on the board. Nothing is deducted from stock until you confirm the print."
                >
                  Add order
                </Button>
              </div>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Discard this order?"
        description="What you filled in here is not saved yet."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={onClose}
      />
    </>
  );
}
