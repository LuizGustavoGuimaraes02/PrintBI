import { formatMoney, PAYMENT_METHODS, type PaymentMethod, type SaleView } from '@printbi/shared';
import { useState } from 'react';
import { Button, Modal, SelectField, TextField, useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { toField } from '../../lib/money';
import { localToday } from '../../lib/period';
import { METHOD_LABEL } from './labels';

/** Money the customer paid, starting with what is still owed. */
export function ReceiptDialog({
  sale,
  onClose,
  onSaved,
}: {
  sale: SaleView;
  onClose: () => void;
  onSaved: (sale: SaleView) => Promise<void>;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState(toField(sale.outstanding));
  const [receivedAt, setReceivedAt] = useState(localToday());
  const [method, setMethod] = useState<PaymentMethod>('transfer');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErrors({});
    try {
      const result = await api.post<SaleView>(`/sales/${sale.id}/receipts`, {
        amount: amount.trim().replace(',', '.'),
        receivedAt,
        method,
        note,
      });
      await onSaved(result);
      toast.success(
        'Receipt recorded',
        result.outstanding > 0
          ? `${formatMoney({ amount: result.outstanding, currency: result.currency })} still to receive`
          : `${result.code} is paid`,
      );
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') setErrors(e.fieldErrors());
      else toast.error('Not recorded', e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Record receipt · ${sale.code}`}
      description={`Still to receive: ${formatMoney({ amount: sale.outstanding, currency: sale.currency })}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Record receipt
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Amount"
          inputMode="decimal"
          mono
          suffix={sale.currency}
          value={amount}
          error={errors.amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TextField
          label="Received on"
          type="date"
          value={receivedAt}
          error={errors.receivedAt}
          onChange={(e) => setReceivedAt(e.target.value)}
        />
        <SelectField
          label="Method"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </SelectField>
        <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
