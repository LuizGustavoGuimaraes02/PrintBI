import { expenseInputSchema, type ExpenseView } from '@printbi/shared';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import {
  Button,
  Notice,
  PageHeader,
  PageLoader,
  Panel,
  SelectField,
  TextAreaField,
  TextField,
  useToast,
} from '../../design-system';
import { api } from '../../lib/api';
import { applyMappedServerErrors, checkPayload } from '../../lib/forms';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { useCan } from '../auth/account';
import { useCategories, useSettings } from '../settings/queries';
import { NoFinanceAccess } from './ExpensesPage';
import { useRefreshExpenses } from './queries';

interface ExpenseForm {
  description: string;
  categoryId: string;
  amount: string;
  currency: 'CAD' | 'BRL';
  purchasedAt: string;
  vendor: string;
  dueDate: string;
  notes: string;
  paymentState: 'paid' | 'partial' | 'pending';
  paidAmount: string;
  paidAt: string;
  method: 'cash' | 'credit' | 'debit' | 'transfer' | 'other';
}

const today = () => new Date().toISOString().slice(0, 10);

export function NewExpensePage() {
  const canManage = useCan('finance:manage');
  const { data: settings } = useSettings();
  const { data: categories } = useCategories();
  if (!canManage) return <NoFinanceAccess />;
  if (!settings || !categories) return <PageLoader />;
  const active = categories.filter((c) => !c.archived);
  return <ExpenseFormPage currency={settings.currency.defaultCurrency} categories={active} />;
}

function ExpenseFormPage({
  currency,
  categories,
}: {
  currency: 'CAD' | 'BRL';
  categories: { id: string; name: string }[];
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const refresh = useRefreshExpenses();
  const defaults: ExpenseForm = {
    description: '',
    categoryId: categories[0]?.id ?? '',
    amount: '',
    currency,
    purchasedAt: today(),
    vendor: '',
    dueDate: '',
    notes: '',
    paymentState: 'paid',
    paidAmount: '',
    paidAt: today(),
    method: 'credit',
  };
  const { register, handleSubmit, control, reset, setError, formState } = useForm<ExpenseForm>({
    defaultValues: defaults,
  });
  const paymentState = useWatch({ control, name: 'paymentState' });
  const { prompt: guard, allowLeave } = useUnsavedChangesGuard(formState.isDirty);

  const toFormPath = (path: string) =>
    path === 'amount.amount' || path === 'amount'
      ? 'amount'
      : path.startsWith('payments')
        ? 'paidAmount'
        : path;

  const submit = (addAnother: boolean) =>
    handleSubmit(async (v) => {
      const paidAmount =
        v.paymentState === 'paid' ? v.amount : v.paymentState === 'partial' ? v.paidAmount : '';
      const payload = {
        description: v.description,
        categoryId: v.categoryId,
        amount: { amount: v.amount, currency: v.currency },
        purchasedAt: v.purchasedAt,
        vendor: v.vendor,
        dueDate: v.dueDate || null,
        notes: v.notes,
        payments: paidAmount
          ? [{ amount: paidAmount, paidAt: v.paidAt, method: v.method, note: '' }]
          : [],
      };
      if (!checkPayload(expenseInputSchema, payload, setError, toFormPath)) return;
      try {
        const expense = await api.post<ExpenseView>('/expenses', payload);
        await refresh();
        toast.success('Expense added', expense.description);
        if (addAnother) reset(defaults);
        else {
          allowLeave();
          void navigate(`/expenses/${expense.id}`);
        }
      } catch (error) {
        applyMappedServerErrors(error, setError, toFormPath);
      }
    });

  const { errors } = formState;
  return (
    <>
      {guard}
      <PageHeader
        eyebrow="Costs & Expenses"
        title="New expense"
        description="Tools, packaging, fees, energy or anything else the business pays for."
      />
      <form onSubmit={(e) => void submit(false)(e)} noValidate className="flex flex-col gap-5">
        <Panel title="What you bought">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Description"
              required
              className="sm:col-span-2"
              placeholder="e.g. Allen key set"
              error={errors.description?.message}
              {...register('description')}
            />
            <SelectField
              label="Category"
              required
              error={errors.categoryId?.message}
              {...register('categoryId')}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Vendor"
              placeholder="e.g. Canadian Tire"
              error={errors.vendor?.message}
              {...register('vendor')}
            />
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <TextField
                label="Amount"
                required
                inputMode="decimal"
                mono
                error={errors.amount?.message}
                {...register('amount')}
              />
              <SelectField label="Currency" {...register('currency')}>
                <option value="CAD">CAD</option>
                <option value="BRL">BRL</option>
              </SelectField>
            </div>
            <TextField
              label="Purchase date"
              type="date"
              required
              error={errors.purchasedAt?.message}
              {...register('purchasedAt')}
            />
            <TextAreaField
              label="Notes"
              rows={2}
              className="sm:col-span-2"
              error={errors.notes?.message}
              {...register('notes')}
            />
          </div>
          <p className="text-[13px] text-ink-muted">
            Buying filament or parts for stock? Add them in Inventory instead and tick “also record
            as an expense”, so stock and money stay linked.
          </p>
        </Panel>
        <Panel title="Payment">
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField label="Status" {...register('paymentState')}>
              <option value="paid">Paid in full</option>
              <option value="partial">Partly paid</option>
              <option value="pending">Not paid yet</option>
            </SelectField>
            {paymentState === 'pending' ? (
              <TextField
                label="Due date"
                type="date"
                error={errors.dueDate?.message}
                {...register('dueDate')}
              />
            ) : (
              <>
                {paymentState === 'partial' && (
                  <TextField
                    label="Amount paid"
                    inputMode="decimal"
                    mono
                    error={errors.paidAmount?.message}
                    {...register('paidAmount')}
                  />
                )}
                <TextField
                  label="Paid on"
                  type="date"
                  error={errors.paidAt?.message}
                  {...register('paidAt')}
                />
                <SelectField label="Method" {...register('method')}>
                  <option value="credit">Credit card</option>
                  <option value="debit">Debit card</option>
                  <option value="cash">Cash</option>
                  <option value="transfer">Transfer</option>
                  <option value="other">Other</option>
                </SelectField>
                {paymentState === 'partial' && (
                  <TextField label="Due date for the rest" type="date" {...register('dueDate')} />
                )}
              </>
            )}
          </div>
        </Panel>
        {errors.root?.server && (
          <Notice tone="attention" title="Not saved">
            {errors.root.server.message}
          </Notice>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={formState.isSubmitting}>
            Save
          </Button>
          <Button
            variant="soft"
            loading={formState.isSubmitting}
            onClick={() => void submit(true)()}
          >
            Save &amp; add another
          </Button>
          <Button variant="ghost" onClick={() => void navigate('/expenses')}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
