import {
  formatMoney,
  type CalculationView,
  type CompanySettingsView,
  type CompanyView,
  type Currency,
  type CustomerView,
  type ProductView,
  type QuoteAction,
  type QuoteLanguage,
  type QuoteView,
} from '@printbi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calculator, FileDown, Eye, Plus, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Badge,
  Button,
  cn,
  DeleteAction,
  EmptyState,
  IconButton,
  Modal,
  Notice,
  PageHeader,
  PageLoader,
  Panel,
  SelectField,
  TextAreaField,
  TextField,
  useToast,
  Hint,
} from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { useCan } from '../auth/account';
import { useCalculation, useCalculations } from '../calculator/queries';
import { useProducts } from '../catalog/queries';
import { useCustomers } from '../customers/queries';
import { useCompany, useSettings } from '../settings/queries';
import { BrazilFlag, CanadaFlag } from '../showcase/language';
import {
  emptyQuote,
  fromQuote,
  lineFromCalculation,
  lineFromProduct,
  lineRow,
  liveTotals,
  taxRow,
  toPayload,
  type LineRow,
  type QuoteForm,
} from './form';
import { quoteKeys, STATUS_BADGE, useQuote, useRefreshQuotes } from './queries';

export function QuoteEditorPage() {
  const { quoteId = '' } = useParams();
  const [params] = useSearchParams();
  const { data: settings } = useSettings();
  const { data: company } = useCompany();
  const { data: quote, isPending } = useQuote(quoteId);
  const fromCalculation = params.get('calculation') ?? '';
  const fromCustomer = params.get('customer') ?? '';
  const { data: customers } = useCustomers();
  const calc = useCalculation(quoteId ? '' : fromCalculation);

  // A new quote can start from a saved calculation or a customer: wait for what it needs.
  const waiting = !quoteId && ((fromCalculation && calc.isPending) || (fromCustomer && !customers));
  const startForm = (): QuoteForm => {
    const form = emptyQuote(settings as CompanySettingsView);
    if (customers?.some((c) => c.id === fromCustomer)) form.customerId = fromCustomer;
    if (calc.data) {
      form.lines = [lineFromCalculation(calc.data)];
      form.currency = calc.data.currency;
      form.showBreakdown = true;
    }
    return form;
  };

  if (!settings || !company || (quoteId && isPending) || waiting) {
    return <PageLoader label="Loading the quote" />;
  }
  if (quoteId && !quote) {
    return (
      <EmptyState
        title="Quote not found"
        action={
          <Link to="/quotes" className="font-semibold text-teal">
            Back to quotes
          </Link>
        }
      >
        It may have been deleted.
      </EmptyState>
    );
  }
  return (
    <QuoteEditor
      key={quote?.id ?? 'new'}
      quote={quote}
      initial={quote ? fromQuote(quote) : startForm()}
      company={company}
    />
  );
}

const LANGUAGES: { value: QuoteLanguage; label: string; Flag: typeof BrazilFlag }[] = [
  { value: 'pt-BR', label: 'Português', Flag: BrazilFlag },
  { value: 'en', label: 'English', Flag: CanadaFlag },
];

function QuoteEditor({
  quote,
  initial,
  company,
}: {
  quote?: QuoteView;
  initial: QuoteForm;
  company: CompanyView;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const refresh = useRefreshQuotes();
  const canSeeCosts = useCan('finance:view');
  const canManageMoney = useCan('finance:manage');
  const canDelete = useCan('records:archive');
  const { data: customers } = useCustomers();
  const { data: products } = useProducts();
  const { data: calculations } = useCalculations('');
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [picker, setPicker] = useState<'product' | 'calculation' | null>(null);
  const dirty = JSON.stringify(form) !== saved;
  const { prompt: guard, allowLeave } = useUnsavedChangesGuard(dirty);
  const locked = quote ? !['draft', 'sent'].includes(quote.status) : false;
  const totals = useMemo(() => liveTotals(form), [form]);
  const currency = form.currency;
  const m = (amount: number) => formatMoney({ amount, currency });

  const set = <K extends keyof QuoteForm>(key: K, value: QuoteForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setLine = (key: string, value: Partial<LineRow>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...value } : l)) }));
  const linked = customers?.find((c) => c.id === form.customerId);

  /** Saves and returns the stored quote (needed before a PDF, which is made from saved data). */
  const save = async (): Promise<QuoteView | null> => {
    setBusy('save');
    setErrors({});
    try {
      const body = toPayload(form);
      const result = quote
        ? await api.put<QuoteView>(`/quotes/${quote.id}`, body)
        : await api.post<QuoteView>('/quotes', body);
      queryClient.setQueryData(quoteKeys.one(result.id), result);
      void refresh();
      setSaved(JSON.stringify(form));
      if (!quote) {
        allowLeave();
        toast.success('Quote saved', result.code);
        void navigate(`/quotes/${result.id}`, { replace: true });
      } else {
        toast.success('Changes saved', result.code);
      }
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        setErrors(error.fieldErrors());
        toast.error('Not saved', 'Check the highlighted fields.');
      } else {
        toast.error('Not saved', error instanceof ApiError ? error.message : undefined);
      }
      return null;
    } finally {
      setBusy(null);
    }
  };

  /** A PDF always reflects what is stored, so unsaved changes are saved first. */
  const withSaved = async (run: (q: QuoteView) => Promise<void>, label: string) => {
    const current = dirty || !quote ? await save() : quote;
    if (!current) return;
    setBusy(label);
    try {
      await run(current);
    } catch {
      toast.error('The PDF could not be made', 'Try again.');
    } finally {
      setBusy(null);
    }
  };
  const openPreview = () =>
    withSaved(async (q) => {
      const { quotePdfUrl } = await import('./pdf/pdf');
      setPreview(await quotePdfUrl(q, company));
    }, 'preview');
  const download = () =>
    withSaved(async (q) => {
      const { downloadQuotePdf } = await import('./pdf/pdf');
      await downloadQuotePdf(q, company);
    }, 'download');

  const act = async (action: QuoteAction) => {
    if (!quote) return;
    if (dirty && !(await save())) return;
    setBusy(action);
    try {
      const result = await api.post<QuoteView>(`/quotes/${quote.id}/actions`, { action, note: '' });
      queryClient.setQueryData(quoteKeys.one(result.id), result);
      void refresh();
      toast.success(STATUS_BADGE[result.status].label, result.code);
    } catch (error) {
      toast.error('Not changed', error instanceof ApiError ? error.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const fieldError = (path: string) => errors[path];
  const status = quote?.displayStatus;

  return (
    <>
      {guard}
      <Link
        to="/quotes"
        className="inline-flex items-center gap-1.5 self-start px-1 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Quotes
      </Link>
      <PageHeader
        eyebrow={quote ? quote.code : 'New quote'}
        title={form.title || (quote ? quote.code : 'New quote')}
        description={
          status ? (
            <span className="flex items-center gap-2">
              <Badge tone={STATUS_BADGE[status].tone}>{STATUS_BADGE[status].label}</Badge>
              {status === 'expired' && <span>Past its validity date.</span>}
            </span>
          ) : (
            'Items, prices and terms for one customer. Nothing here touches stock or sales.'
          )
        }
        actions={
          quote && (
            <>
              {(quote.status === 'draft' || quote.status === 'sent') && (
                <>
                  <Button
                    variant="soft"
                    loading={busy === 'send'}
                    hint="Records that you sent it to the customer. Nothing is sent from here: share the PDF yourself."
                    onClick={() => void act('send')}
                  >
                    {quote.status === 'sent' ? 'Mark sent again' : 'Mark sent'}
                  </Button>
                  <Button
                    variant="soft"
                    loading={busy === 'approve'}
                    hint="The customer said yes. The quote locks; the printing order is created only when you click Create printing order."
                    onClick={() => void act('approve')}
                  >
                    Approved
                  </Button>
                  <Button
                    variant="ghost"
                    loading={busy === 'reject'}
                    hint="The customer said no. The quote locks and stays in the list; Reopen brings it back."
                    onClick={() => void act('reject')}
                  >
                    Rejected
                  </Button>
                  <Button
                    variant="ghost"
                    loading={busy === 'cancel'}
                    hint="You called it off. It locks and stays in the list; Reopen brings it back."
                    onClick={() => void act('cancel')}
                  >
                    Cancel quote
                  </Button>
                </>
              )}
              {quote.orderId ? (
                <Link
                  to={`/orders?card=${quote.orderId}`}
                  className="inline-flex h-12 items-center rounded-full bg-teal px-6 text-[15px] font-bold text-white hover:bg-teal-strong"
                >
                  Open its order
                </Link>
              ) : (
                quote.status === 'approved' && (
                  <Hint text="Opens a new order filled from this quote for you to review. Nothing is created until you save it.">
                    <Link
                      to={`/orders/new?quote=${quote.id}`}
                      className="inline-flex h-12 items-center rounded-full bg-teal px-6 text-[15px] font-bold text-white hover:bg-teal-strong"
                    >
                      Create printing order
                    </Link>
                  </Hint>
                )
              )}
              {quote.saleId ? (
                <Link
                  to={`/sales/${quote.saleId}`}
                  className="inline-flex h-12 items-center rounded-full bg-teal-soft px-6 text-[15px] font-bold text-teal-ink hover:bg-[#d3eaee]"
                >
                  Open its sale
                </Link>
              ) : (
                quote.status === 'approved' &&
                canManageMoney && (
                  <Hint text="Opens a new sale filled from this quote to review. One quote makes one sale; nothing is deducted from stock.">
                    <Link
                      to={`/sales/new?quote=${quote.id}`}
                      className="inline-flex h-12 items-center rounded-full bg-teal-soft px-6 text-[15px] font-bold text-teal-ink hover:bg-[#d3eaee]"
                    >
                      Register sale
                    </Link>
                  </Hint>
                )
              )}
              {locked && (
                <Button
                  variant="soft"
                  loading={busy === 'reopen'}
                  hint="Turns it back into a draft you can edit. Its history is kept."
                  onClick={() => void act('reopen')}
                >
                  Reopen
                </Button>
              )}
            </>
          )
        }
      />
      {locked && (
        <Notice title={`This quote is ${quote?.status}`}>
          Its content is kept as it was. Reopen it to make changes.
        </Notice>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <fieldset disabled={locked} className="flex min-w-0 flex-col gap-5">
          <Panel title="Customer and details">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Customer"
                value={form.customerId}
                onChange={(e) => set('customerId', e.target.value)}
              >
                <option value="">Someone not registered</option>
                {(customers ?? []).map((c: CustomerView) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` · ${c.company}` : ''}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Title"
                placeholder="e.g. 10 personalized keychains"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </div>
            {linked ? (
              <p className="text-sm text-ink-muted">
                {[linked.email, linked.phone, linked.address].filter(Boolean).join(' · ') ||
                  'No contact details yet.'}{' '}
                Their details are copied onto the quote when it is saved.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Name"
                  required
                  value={form.customer.name}
                  error={fieldError('customer.name')}
                  onChange={(e) => set('customer', { ...form.customer, name: e.target.value })}
                />
                <TextField
                  label="Company"
                  value={form.customer.company}
                  onChange={(e) => set('customer', { ...form.customer, company: e.target.value })}
                />
                <TextField
                  label="Email"
                  type="email"
                  value={form.customer.email}
                  onChange={(e) => set('customer', { ...form.customer, email: e.target.value })}
                />
                <TextField
                  label="Phone / WhatsApp"
                  value={form.customer.phone}
                  onChange={(e) => set('customer', { ...form.customer, phone: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <fieldset className="col-span-2 flex flex-col gap-1.5">
                <legend className="label-mono mb-1.5 text-ink-muted">PDF language</legend>
                <div className="flex h-12 gap-1 rounded-full bg-bench p-1">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      aria-pressed={form.language === l.value}
                      onClick={() => set('language', l.value)}
                      className={cn(
                        'inline-flex flex-1 items-center justify-center gap-2 rounded-full text-sm font-bold',
                        form.language === l.value
                          ? 'bg-surface text-ink shadow-sm'
                          : 'text-ink-muted hover:text-ink',
                      )}
                    >
                      <span className="inline-flex overflow-hidden rounded-[3px] ring-1 ring-black/10">
                        <l.Flag width={20} />
                      </span>
                      {l.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <TextField
                label="Date"
                type="date"
                value={form.issuedAt}
                onChange={(e) => set('issuedAt', e.target.value)}
              />
              <TextField
                label="Valid until"
                type="date"
                value={form.validUntil}
                onChange={(e) => set('validUntil', e.target.value)}
              />
            </div>
          </Panel>

          <Panel
            title="Items"
            actions={
              <SelectField
                label="Currency"
                value={currency}
                onChange={(e) => set('currency', e.target.value as Currency)}
                className="w-28"
              >
                <option value="CAD">CAD</option>
                <option value="BRL">BRL</option>
              </SelectField>
            }
          >
            {form.lines.map((line, index) => {
              const stale =
                line.calculationId &&
                line.calcQuantity !== null &&
                Number(line.quantity.replace(',', '.')) * 1_000_000 !== line.calcQuantity;
              return (
                <div
                  key={line.key}
                  className="flex gap-3 border-t border-rule-soft pt-4 first:border-t-0 first:pt-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <TextField
                      label="Description"
                      value={line.description}
                      error={fieldError(`lines.${index}.description`)}
                      onChange={(e) => setLine(line.key, { description: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <TextField
                        label="Quantity"
                        inputMode="decimal"
                        mono
                        value={line.quantity}
                        error={fieldError(`lines.${index}.quantity`)}
                        onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                      />
                      <TextField
                        label="Unit"
                        placeholder="pcs, h…"
                        value={line.unit}
                        onChange={(e) => setLine(line.key, { unit: e.target.value })}
                      />
                      <TextField
                        label="Unit price"
                        inputMode="decimal"
                        mono
                        suffix={currency}
                        value={line.unitPrice}
                        onChange={(e) => setLine(line.key, { unitPrice: e.target.value })}
                      />
                      <TextField
                        label="Discount"
                        inputMode="decimal"
                        mono
                        suffix={currency}
                        value={line.discount}
                        onChange={(e) => setLine(line.key, { discount: e.target.value })}
                      />
                    </div>
                    {line.calculationId && (
                      <p className={cn('text-[13px]', stale ? 'text-hot-ink' : 'text-ink-muted')}>
                        <Calculator size={13} aria-hidden="true" className="mr-1 inline" />
                        {stale
                          ? 'The quantity differs from the calculation, so its cost breakdown won’t show on the PDF.'
                          : 'From a saved calculation: its cost breakdown can show on the PDF.'}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end justify-between gap-2 pt-7">
                    <span className="figure text-sm font-medium">
                      {totals ? m(totals.lines[index] ?? 0) : '—'}
                    </span>
                    {form.lines.length > 1 && (
                      <IconButton
                        label="Remove item"
                        onClick={() =>
                          set(
                            'lines',
                            form.lines.filter((l) => l.key !== line.key),
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    )}
                  </div>
                </div>
              );
            })}
            {fieldError('lines') && (
              <p className="text-[13px] font-semibold text-hot-ink">{fieldError('lines')}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <AddButton onClick={() => set('lines', [...form.lines, lineRow()])}>
                Add item
              </AddButton>
              <AddButton onClick={() => setPicker('product')}>From a product</AddButton>
              {canSeeCosts && (
                <AddButton onClick={() => setPicker('calculation')}>From a calculation</AddButton>
              )}
            </div>
          </Panel>

          <Panel title="Discount, delivery and taxes">
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <TextField
                label="Overall discount"
                inputMode="decimal"
                mono
                suffix={currency}
                value={form.discount}
                onChange={(e) => set('discount', e.target.value)}
              />
              <TextField
                label="Delivery"
                inputMode="decimal"
                mono
                suffix={currency}
                value={form.delivery}
                onChange={(e) => set('delivery', e.target.value)}
              />
            </div>
            {form.taxes.map((tax, index) => (
              <div key={tax.key} className="flex items-end gap-3">
                <TextField
                  label="Tax"
                  placeholder="e.g. HST"
                  className="flex-1"
                  value={tax.label}
                  error={fieldError(`taxes.${index}.label`)}
                  onChange={(e) =>
                    set(
                      'taxes',
                      form.taxes.map((t) =>
                        t.key === tax.key ? { ...t, label: e.target.value } : t,
                      ),
                    )
                  }
                />
                <TextField
                  label="Rate"
                  inputMode="decimal"
                  mono
                  suffix="%"
                  className="w-32"
                  value={tax.percent}
                  onChange={(e) =>
                    set(
                      'taxes',
                      form.taxes.map((t) =>
                        t.key === tax.key ? { ...t, percent: e.target.value } : t,
                      ),
                    )
                  }
                />
                <IconButton
                  label="Remove tax"
                  className="mb-1.5"
                  onClick={() =>
                    set(
                      'taxes',
                      form.taxes.filter((t) => t.key !== tax.key),
                    )
                  }
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            ))}
            <AddButton onClick={() => set('taxes', [...form.taxes, taxRow()])}>Add a tax</AddButton>
            <p className="text-[13px] text-ink-muted">
              Taxes are added on top of subtotal − discount + delivery. Nothing is assumed for your
              region.
            </p>
          </Panel>

          <Panel title="Terms">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Production and delivery time"
                placeholder="e.g. 7 business days"
                value={form.leadTime}
                onChange={(e) => set('leadTime', e.target.value)}
              />
              <TextField
                label="Delivery method"
                placeholder="e.g. Pickup or shipping"
                value={form.deliveryMethod}
                onChange={(e) => set('deliveryMethod', e.target.value)}
              />
              <TextAreaField
                label="Payment terms"
                rows={2}
                className="sm:col-span-2"
                value={form.paymentTerms}
                onChange={(e) => set('paymentTerms', e.target.value)}
              />
              <TextAreaField
                label="Notes for the customer"
                rows={2}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
              <TextAreaField
                label="Private notes"
                hint="Never on the PDF."
                rows={2}
                value={form.privateNotes}
                onChange={(e) => set('privateNotes', e.target.value)}
              />
            </div>
            <p className="text-[13px] text-ink-muted">
              What you type here appears on the PDF exactly as written; only the fixed labels follow
              the PDF language.
            </p>
          </Panel>
        </fieldset>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-6" aria-label="Totals and actions">
          <Panel className="gap-3">
            <span className="label-mono text-ink-muted">Total</span>
            <span className="figure text-[34px] leading-none font-medium">
              {totals ? m(totals.total) : '—'}
            </span>
            {totals && (
              <dl className="flex flex-col gap-1.5 border-t border-rule-soft pt-3 text-sm">
                <Row label="Subtotal" value={m(totals.subtotal)} />
                {totals.discount > 0 && <Row label="Discount" value={`−${m(totals.discount)}`} />}
                {totals.delivery > 0 && <Row label="Delivery" value={m(totals.delivery)} />}
                {totals.taxes.map((amount, i) => (
                  <Row key={i} label={form.taxes[i]?.label || 'Tax'} value={m(amount)} />
                ))}
              </dl>
            )}
            {canSeeCosts && form.lines.some((l) => l.calculationId) && (
              <label className="flex cursor-pointer items-start gap-3 border-t border-rule-soft pt-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-teal"
                  disabled={locked}
                  checked={form.showBreakdown}
                  onChange={(e) => set('showBreakdown', e.target.checked)}
                />
                <span>
                  <span className="font-semibold">Show the cost breakdown on the PDF</span>
                  <span className="block text-[13px] text-ink-muted">
                    Each component at its purchase cost, plus the added profit.
                  </span>
                </span>
              </label>
            )}
          </Panel>
          <Panel className="gap-3">
            {!locked && (
              <Button
                loading={busy === 'save'}
                disabled={quote && !dirty}
                onClick={() => void save()}
              >
                {quote ? (dirty ? 'Save changes' : 'Saved') : 'Save draft'}
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="soft"
                icon={<Eye size={16} />}
                loading={busy === 'preview'}
                onClick={() => void openPreview()}
              >
                Preview
              </Button>
              <Button
                variant="soft"
                icon={<FileDown size={16} />}
                loading={busy === 'download'}
                onClick={() => void download()}
              >
                PDF
              </Button>
            </div>
            <p className="text-[12px] text-ink-muted">
              Making the PDF doesn’t mark the quote as sent: use “Mark sent” once you send it.
            </p>
            {quote && canDelete && (
              <div className="flex justify-end">
                <DeleteAction
                  size="sm"
                  title={`Delete ${quote.code}?`}
                  description="For a quote made by mistake. One that was sent and declined is better marked Rejected or Cancelled, to keep the history."
                  confirmLabel="Delete quote"
                  hint="Deletes it for good, for a quote made by mistake. Rejected or Cancelled keep the history."
                  onDelete={async () => {
                    try {
                      await api.delete(`/quotes/${quote.id}`);
                    } catch (e) {
                      toast.error('Not deleted', e instanceof ApiError ? e.message : undefined);
                      throw e;
                    }
                    toast.success('Quote deleted', quote.code);
                    allowLeave();
                    await refresh();
                    void navigate('/quotes', { replace: true });
                  }}
                />
              </div>
            )}
          </Panel>
          {quote && quote.history.length > 0 && (
            <Panel title="History" className="gap-3">
              <ol className="flex flex-col gap-2 text-sm">
                {quote.history.map((h, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>
                      <Badge tone={STATUS_BADGE[h.status].tone}>
                        {STATUS_BADGE[h.status].label}
                      </Badge>
                      {h.by && <span className="ml-2 text-ink-muted">{h.by}</span>}
                    </span>
                    <span className="figure text-[12px] text-ink-muted">
                      {new Date(h.at).toLocaleDateString('en-CA')}
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </aside>
      </div>

      {picker && (
        <ItemPicker
          kind={picker}
          products={products ?? []}
          calculations={calculations ?? []}
          onClose={() => setPicker(null)}
          onPickProduct={(product) => {
            const fresh = form.lines.length === 1 && !form.lines[0]?.description;
            set('lines', [...(fresh ? [] : form.lines), lineFromProduct(product, form.language)]);
            setPicker(null);
          }}
          onPickCalculation={async (id) => {
            try {
              const calc = await api.get<CalculationView>(`/calculations/${id}`);
              const fresh = form.lines.length === 1 && !form.lines[0]?.description;
              setForm((f) => ({
                ...f,
                showBreakdown: true,
                lines: [...(fresh ? [] : f.lines), lineFromCalculation(calc)],
              }));
              if (calc.currency !== currency)
                toast.error('Different currency', `The calculation is in ${calc.currency}.`);
            } catch {
              toast.error('Calculation not loaded');
            }
            setPicker(null);
          }}
        />
      )}
      {preview && (
        <PdfPreview
          url={preview}
          onClose={() => {
            URL.revokeObjectURL(preview);
            setPreview(null);
          }}
        />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="figure">{value}</dd>
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-rule px-4 text-sm font-semibold text-ink-muted hover:border-teal hover:text-teal"
    >
      <Plus size={15} aria-hidden="true" /> {children}
    </button>
  );
}

function ItemPicker({
  kind,
  products,
  calculations,
  onClose,
  onPickProduct,
  onPickCalculation,
}: {
  kind: 'product' | 'calculation';
  products: ProductView[];
  calculations: {
    id: string;
    name: string;
    quantity: number;
    unitPrice: number | null;
    currency: Currency;
  }[];
  onClose: () => void;
  onPickProduct: (product: ProductView) => void;
  onPickCalculation: (id: string) => void | Promise<void>;
}) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const match = (name: string) => name.toLowerCase().includes(q.trim().toLowerCase());
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={kind === 'product' ? 'Add a product' : 'Add a saved calculation'}
    >
      <div className="flex flex-col gap-3">
        <input
          ref={input}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          aria-label="Search"
          className="h-11 rounded-full border-[1.5px] border-rule px-4 outline-none focus:border-teal"
        />
        <ul className="flex max-h-80 flex-col overflow-y-auto">
          {kind === 'product'
            ? products
                .filter((p) => match(p.name))
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onPickProduct(p)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-bench"
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className="figure text-sm text-ink-muted">
                        {p.price ? formatMoney(p.price) : 'No price'}
                      </span>
                    </button>
                  </li>
                ))
            : calculations
                .filter((c) => match(c.name))
                .map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => void onPickCalculation(c.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-bench"
                    >
                      <span>
                        <span className="font-semibold">{c.name}</span>
                        <span className="block text-[13px] text-ink-muted">
                          {c.quantity} pieces
                        </span>
                      </span>
                      <span className="figure text-sm text-ink-muted">
                        {c.unitPrice === null
                          ? '—'
                          : `${formatMoney({ amount: c.unitPrice, currency: c.currency })} each`}
                      </span>
                    </button>
                  </li>
                ))}
        </ul>
      </div>
    </Modal>
  );
}

function PdfPreview({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title="PDF preview" width="lg">
      <iframe
        title="Quote PDF"
        src={url}
        className="h-[70vh] w-full rounded-[14px] border border-rule-soft"
      />
    </Modal>
  );
}
