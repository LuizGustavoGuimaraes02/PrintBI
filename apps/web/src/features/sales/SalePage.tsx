import {
  formatMoney,
  PAYMENT_METHODS,
  SALE_PRODUCTION,
  saleProfit,
  sum,
  type Currency,
  type SaleProduction,
  type SaleView,
} from '@printbi/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  ChevronDown,
  Coins,
  Factory,
  Megaphone,
  NotebookPen,
  PackageCheck,
  Plus,
  Trash2,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Badge,
  Button,
  cn,
  DeleteAction,
  EmptyState,
  Hint,
  Modal,
  Notice,
  PageHeader,
  PageLoader,
  Panel,
  SelectField,
  TextField,
  useToast,
} from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { localToday } from '../../lib/period';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { useCan } from '../auth/account';
import { useProducts } from '../catalog/queries';
import { CustomerDialog } from '../customers/CustomerDialog';
import { useCustomers, useCustomerSources } from '../customers/queries';
import { NoFinanceAccess } from '../expenses/ExpensesPage';
import { ConsumeDialog } from '../inventory/ConsumeDialog';
import { showDay } from '../orders/labels';
import { useSettings } from '../settings/queries';
import {
  emptyLine,
  emptySale,
  fromDraft,
  fromSale,
  liveTotals,
  microOf,
  newKey,
  toPayload,
  type SaleForm,
  type SaleLineForm,
} from './form';
import {
  BASIS_LABEL,
  COST_SUGGESTIONS,
  METHOD_LABEL,
  PAYMENT_LABEL,
  PRODUCTION_LABEL,
} from './labels';
import { saleKeys, useRefreshSales, useSale, useSaleDraft } from './queries';
import { ReceiptDialog } from './ReceiptDialog';

export function SalePage() {
  if (!useCan('finance:view')) return <NoFinanceAccess />;
  return <SaleLoader />;
}

function SaleLoader() {
  const { saleId = '' } = useParams();
  const [params] = useSearchParams();
  const draftQuery: Record<string, string> = {};
  if (!saleId) {
    for (const [param, key] of [
      ['order', 'orderId'],
      ['quote', 'quoteId'],
      ['calculation', 'calculationId'],
      ['customer', 'customerId'],
    ] as const) {
      const value = params.get(param);
      if (value) draftQuery[key] = value;
    }
  }
  const { data: settings } = useSettings();
  const sale = useSale(saleId);
  const draft = useSaleDraft(draftQuery, !saleId);
  const today = localToday();

  if (!settings || (saleId && sale.isPending) || (!saleId && draft.isPending)) {
    return <PageLoader label="Loading the sale" />;
  }
  if ((saleId && !sale.data) || (!saleId && !draft.data)) {
    return (
      <EmptyState
        title="Not found"
        action={
          <Link to="/sales" className="font-semibold text-teal">
            Back to sales
          </Link>
        }
      >
        It may have been deleted.
      </EmptyState>
    );
  }
  if (draft.data?.existingSaleId) {
    return (
      <>
        <BackLink />
        <PageHeader title="Register sale" />
        <Notice title={`${draft.data.from?.label ?? 'This'} already has a sale`}>
          Each order and each quote makes one sale, so nothing is counted twice.{' '}
          <Link to={`/sales/${draft.data.existingSaleId}`} className="font-semibold text-teal">
            Open that sale
          </Link>
        </Notice>
      </>
    );
  }
  const initial = sale.data
    ? fromSale(sale.data)
    : draft.data
      ? fromDraft(draft.data, today)
      : emptySale(today, settings.currency.defaultCurrency);
  return (
    <SaleEditor
      key={sale.data?.id ?? 'new'}
      sale={sale.data}
      initial={initial}
      fromLabel={draft.data?.from ? `${draft.data.from.kind} ${draft.data.from.label}` : ''}
    />
  );
}

function BackLink() {
  return (
    <Link
      to="/sales"
      className="inline-flex items-center gap-1.5 self-start px-1 text-sm font-semibold text-ink-muted hover:text-ink"
    >
      <ArrowLeft size={16} aria-hidden="true" /> Sales
    </Link>
  );
}

const money = (amount: number, currency: Currency) => formatMoney({ amount, currency });

function SaleEditor({
  sale,
  initial,
  fromLabel,
}: {
  sale?: SaleView;
  initial: SaleForm;
  fromLabel: string;
}) {
  const ids = useId();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const refresh = useRefreshSales();
  const canManage = useCan('finance:manage');
  const canArchive = useCan('records:archive');
  const { data: customers = [] } = useCustomers();
  const { data: sources = [] } = useCustomerSources();
  const { data: products = [] } = useProducts();
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(() => initial.lines.some((l) => l.discount || l.estimatedCost));
  const [details, setDetails] = useState(
    () => Boolean(initial.sourceId || initial.notes) || initial.production !== 'to_start',
  );
  const [dialog, setDialog] = useState<'receipt' | 'usage' | 'cancel' | 'customer' | null>(null);
  const dirty = JSON.stringify(form) !== saved;
  const { prompt: guard, allowLeave } = useUnsavedChangesGuard(dirty);
  const isNew = !sale;
  const locked = Boolean(sale?.cancelled) || !canManage;
  const set = <K extends keyof SaleForm>(key: K, value: SaleForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setLine = (key: number, patch: Partial<SaleLineForm>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const id = (name: string) => `${ids}-${name}`;

  const totals = liveTotals(form);
  const estimates = form.lines.map((l) =>
    l.estimatedCost.trim() ? microOf(l.estimatedCost) : null,
  );
  const extras = sum(form.costs.map((c) => microOf(c.amount)));
  const profit = saleProfit({
    total: totals.total,
    currency: form.currency,
    recorded: sale ? [...sale.recorded.materials, ...sale.recorded.losses] : [],
    recordedLines: sale?.recorded.lines ?? 0,
    estimated: estimates.some((e) => e !== null) ? sum(estimates.map((e) => e ?? 0)) : null,
    extras,
    brlPerCad: sale?.brlPerCad ?? null,
  });
  const received = sale ? sale.received : microOf(form.receivedNow);
  const outstanding = Math.max(0, totals.total - received);

  const recipientValue =
    form.customerKind === 'customer' ? `c:${form.customerId}` : form.customerKind;
  const pickRecipient = (value: string) => {
    if (value === 'new') setDialog('customer');
    else if (value.startsWith('c:')) {
      setForm((f) => ({ ...f, customerKind: 'customer', customerId: value.slice(2) }));
    } else setForm((f) => ({ ...f, customerKind: value as 'name' | 'unknown' }));
  };
  const addProduct = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const line: SaleLineForm = {
      ...emptyLine(),
      productId,
      description: product.name,
      unitPrice: product.price ? String(product.price.amount / 1_000_000) : '',
      estimatedCost: product.estimatedCost ? String(product.estimatedCost.amount / 1_000_000) : '',
    };
    setForm((f) => ({
      ...f,
      // An untouched first line is replaced instead of left empty above the product.
      lines:
        f.lines.length === 1 && !f.lines[0]!.description && !f.lines[0]!.unitPrice
          ? [line]
          : [...f.lines, line],
    }));
  };

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const body = toPayload(form, isNew);
      const result = sale
        ? await api.put<SaleView>(`/sales/${sale.id}`, body)
        : await api.post<SaleView>('/sales', body);
      queryClient.setQueryData(saleKeys.one(result.id), result);
      void refresh();
      setSaved(JSON.stringify(form));
      allowLeave();
      toast.success(sale ? 'Changes saved' : `${result.code} registered`, result.items);
      if (!sale) void navigate(`/sales/${result.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') {
        const fields = e.fieldErrors();
        setErrors(fields);
        if (Object.keys(fields).some((k) => /lines\.\d+\.(discount|estimatedCost)/.test(k))) {
          setMore(true);
        }
        if (
          Object.keys(fields).some((k) =>
            ['sourceId', 'currency', 'production', 'notes'].includes(k),
          )
        ) {
          setDetails(true);
        }
        toast.error('Not saved', 'Check the highlighted fields.');
      } else if (e instanceof ApiError && e.code === 'SALE_EXISTS') {
        toast.error('Already registered', e.message);
      } else {
        toast.error('Not saved', e instanceof ApiError ? e.message : undefined);
      }
    } finally {
      setBusy(false);
    }
  };

  const store = async (result: SaleView) => {
    queryClient.setQueryData(saleKeys.one(result.id), result);
    await refresh();
  };

  return (
    <>
      {guard}
      <BackLink />
      <PageHeader
        eyebrow={isNew && fromLabel ? `From ${fromLabel}` : undefined}
        title={sale ? sale.code : 'Register sale'}
        actions={
          sale &&
          !sale.cancelled &&
          canManage && (
            <>
              {sale.outstanding > 0 && (
                <Button
                  icon={<Banknote size={17} aria-hidden="true" />}
                  hint="Records money the customer paid. What is still owed goes down; a linked order's payment follows."
                  onClick={() => setDialog('receipt')}
                >
                  Record receipt
                </Button>
              )}
              {!sale.order && (
                <Button
                  variant="soft"
                  icon={<PackageCheck size={17} aria-hidden="true" />}
                  hint="Deducts the stock this sale used right away; its cost then replaces the estimate in the profit."
                  onClick={() => setDialog('usage')}
                >
                  Record usage
                </Button>
              )}
            </>
          )
        }
      />

      {sale && (
        <div className="-mt-2 flex flex-wrap items-center gap-2 px-1">
          {sale.cancelled ? (
            <Badge tone="hot">Cancelled</Badge>
          ) : (
            <Badge
              tone={
                sale.payment === 'paid' ? 'teal' : sale.payment === 'partial' ? 'neutral' : 'hot'
              }
            >
              {PAYMENT_LABEL[sale.payment]}
            </Badge>
          )}
          <Badge>{PRODUCTION_LABEL[sale.production]}</Badge>
          {sale.order && (
            <Link
              to={`/orders?card=${sale.order.id}`}
              className="text-[14px] font-semibold text-teal"
            >
              Order: {sale.order.title}
            </Link>
          )}
          {sale.quote && (
            <Link
              to={`/quotes/${sale.quote.id}`}
              className="figure text-[14px] font-semibold text-teal"
            >
              {sale.quote.code}
            </Link>
          )}
        </div>
      )}
      {sale?.cancelled && (
        <Notice tone="attention" title="Cancelled">
          {sale.cancelReason} It stays on record and out of the totals; receipts and stock used were
          not reversed.
        </Notice>
      )}

      <form
        className="flex max-w-3xl flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={locked} className="flex min-w-0 flex-col gap-5">
          <Panel className="gap-1">
            <Prop icon={User} label="Customer" htmlFor={id('who')} top>
              <Select
                id={id('who')}
                value={recipientValue}
                onChange={(e) => pickRecipient(e.target.value)}
              >
                <option value="unknown">Walk-in, no name</option>
                <option value="name">Someone (type a name)</option>
                <optgroup label="Customers">
                  {form.customerKind === 'customer' && !form.customerId && (
                    <option value="c:">Choose a customer…</option>
                  )}
                  {customers
                    .filter((c) => !c.archived || c.id === form.customerId)
                    .map((c) => (
                      <option key={c.id} value={`c:${c.id}`}>
                        {c.name}
                        {c.company ? ` · ${c.company}` : ''}
                      </option>
                    ))}
                  <option value="new">+ New customer…</option>
                </optgroup>
              </Select>
              {form.customerKind === 'name' && (
                <input
                  aria-label="Customer name"
                  value={form.customerName}
                  placeholder="Type their name"
                  onChange={(e) => set('customerName', e.target.value)}
                  className={cn(control, 'mt-1')}
                />
              )}
              <FieldError text={errors['customer.name'] ?? errors['customer.customerId']} />
            </Prop>
            <Prop icon={CalendarDays} label="Date" htmlFor={id('date')}>
              <input
                id={id('date')}
                type="date"
                value={form.saleDate}
                onChange={(e) => set('saleDate', e.target.value)}
                className={cn(control, 'w-auto')}
              />
            </Prop>
            {details && (
              <>
                {sources.length > 0 && (
                  <Prop icon={Megaphone} label="Came from" htmlFor={id('source')}>
                    <Select
                      id={id('source')}
                      value={form.sourceId}
                      onChange={(e) => set('sourceId', e.target.value)}
                    >
                      <option value="">Not recorded</option>
                      {sources
                        .filter((s) => !s.archived || s.id === form.sourceId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </Select>
                  </Prop>
                )}
                <Prop icon={Coins} label="Currency" htmlFor={id('currency')}>
                  {isNew ? (
                    <Select
                      id={id('currency')}
                      value={form.currency}
                      onChange={(e) => set('currency', e.target.value as Currency)}
                    >
                      <option value="CAD">CAD</option>
                      <option value="BRL">BRL</option>
                    </Select>
                  ) : (
                    <span className="figure px-2.5 text-[15px]">{form.currency}</span>
                  )}
                </Prop>
                <Prop icon={Factory} label="Production" htmlFor={id('production')}>
                  {sale?.order || form.orderId ? (
                    <span className="px-2.5 text-[15px] text-ink-muted">
                      {sale ? `${PRODUCTION_LABEL[sale.production]}: ` : ''}follows its order on the
                      board
                    </span>
                  ) : (
                    <Select
                      id={id('production')}
                      value={form.production}
                      onChange={(e) => set('production', e.target.value as SaleProduction)}
                    >
                      {SALE_PRODUCTION.map((p) => (
                        <option key={p} value={p}>
                          {PRODUCTION_LABEL[p]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Prop>
                <Prop icon={NotebookPen} label="Notes" htmlFor={id('notes')} top>
                  <textarea
                    id={id('notes')}
                    rows={1}
                    value={form.notes}
                    placeholder="Only your team sees this"
                    onChange={(e) => set('notes', e.target.value)}
                    className={cn(control, 'field-sizing-content h-auto min-h-10 resize-none py-2')}
                  />
                </Prop>
              </>
            )}
            <button
              type="button"
              onClick={() => setDetails(!details)}
              className="mt-1 self-start rounded-full px-2.5 py-1.5 text-[14px] font-semibold text-teal hover:bg-bench"
            >
              {details ? 'Fewer details' : 'More details: source, currency, production, notes'}
            </button>
          </Panel>

          <Panel title="Items" className="gap-3">
            <ol className="flex flex-col gap-3">
              {form.lines.map((line, index) => {
                const amount = totals.lines[index] ?? 0;
                return (
                  <li
                    key={line.key}
                    className="flex flex-col gap-2 rounded-[var(--radius-tile)] bg-bench p-3"
                  >
                    <div className="flex items-start gap-2">
                      <input
                        aria-label={`Item ${index + 1}`}
                        value={line.description}
                        placeholder="What was sold"
                        aria-invalid={Boolean(errors[`lines.${index}.description`])}
                        onChange={(e) => setLine(line.key, { description: e.target.value })}
                        className={cn(control, 'bg-surface font-semibold')}
                      />
                      {form.lines.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remove item ${index + 1}`}
                          onClick={() =>
                            set(
                              'lines',
                              form.lines.filter((l) => l.key !== line.key),
                            )
                          }
                          className="grid size-10 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
                        >
                          <X size={17} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-end gap-2">
                      <SmallField
                        label="Qty"
                        value={line.quantity}
                        error={errors[`lines.${index}.quantity`]}
                        onChange={(v) => setLine(line.key, { quantity: v })}
                      />
                      <SmallField
                        label={`Unit price · ${form.currency}`}
                        value={line.unitPrice}
                        error={errors[`lines.${index}.unitPrice`]}
                        onChange={(v) => setLine(line.key, { unitPrice: v })}
                      />
                      <span className="figure pb-2.5 text-right text-[15px] font-semibold">
                        {money(amount, form.currency)}
                      </span>
                    </div>
                    {more && (
                      <div className="grid grid-cols-2 gap-2">
                        <SmallField
                          label="Discount"
                          value={line.discount}
                          onChange={(v) => setLine(line.key, { discount: v })}
                        />
                        <SmallField
                          label="Estimated cost (all units)"
                          value={line.estimatedCost}
                          onChange={(v) => setLine(line.key, { estimatedCost: v })}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <FieldError text={errors.lines} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="soft"
                size="sm"
                icon={<Plus size={16} aria-hidden="true" />}
                onClick={() => set('lines', [...form.lines, emptyLine()])}
              >
                Add item
              </Button>
              {products.length > 0 && (
                <SelectField
                  label="Add from the catalog"
                  value=""
                  onChange={(e) => addProduct(e.target.value)}
                  className="w-64 [&_label]:sr-only"
                >
                  <option value="">+ From the catalog…</option>
                  {products
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </SelectField>
              )}
              <button
                type="button"
                onClick={() => setMore(!more)}
                className="ml-auto rounded-full px-2.5 py-1.5 text-[14px] font-semibold text-teal hover:bg-bench"
              >
                {more ? 'Hide discounts and costs' : 'Line discounts and costs'}
              </button>
            </div>

            <dl className="ml-auto flex w-full max-w-sm flex-col gap-1.5 border-t border-rule pt-3 text-[15px]">
              <Row label="Subtotal">{money(totals.subtotal, form.currency)}</Row>
              <Row label="Discount">
                <InlineMoney
                  value={form.discount}
                  onChange={(v) => set('discount', v)}
                  label="Discount"
                />
              </Row>
              <Row label="Delivery charged">
                <InlineMoney
                  value={form.delivery}
                  onChange={(v) => set('delivery', v)}
                  label="Delivery charged"
                />
              </Row>
              <Row label="Total" strong>
                {money(totals.total, form.currency)}
              </Row>
            </dl>
          </Panel>

          <Panel title="Payment" className="gap-3">
            {isNew ? (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
                <TextField
                  label="Received now"
                  inputMode="decimal"
                  mono
                  suffix={form.currency}
                  hint="A deposit or the full amount. More receipts can be recorded later."
                  value={form.receivedNow}
                  error={errors['receipts.0.amount']}
                  onChange={(e) => set('receivedNow', e.target.value)}
                />
                <SelectField
                  label="Method"
                  value={form.receivedMethod}
                  onChange={(e) =>
                    set('receivedMethod', e.target.value as SaleForm['receivedMethod'])
                  }
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABEL[m]}
                    </option>
                  ))}
                </SelectField>
              </div>
            ) : sale.receipts.length === 0 ? (
              <p className="text-[15px] text-ink-muted">Nothing received yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-rule-soft">
                {sale.receipts.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2">
                    <span className="figure w-28 text-[13px] text-ink-muted">
                      {showDay(r.receivedAt)}
                    </span>
                    <span className="min-w-0 flex-1 text-[14px]">
                      {METHOD_LABEL[r.method]}
                      {r.note && ` · ${r.note}`}
                      <span className="text-ink-muted"> · {r.by}</span>
                    </span>
                    <span className="figure font-semibold">{money(r.amount, sale.currency)}</span>
                    {canManage && (
                      <Hint text="Removes a receipt recorded by mistake. The audit log keeps it.">
                        <button
                          type="button"
                          aria-label="Remove receipt"
                          onClick={() =>
                            void api
                              .delete<SaleView>(`/sales/${sale.id}/receipts/${r.id}`)
                              .then(store)
                              .then(() => toast.success('Receipt removed'))
                              .catch((e: unknown) =>
                                toast.error(
                                  'Not removed',
                                  e instanceof ApiError ? e.message : undefined,
                                ),
                              )
                          }
                          className="grid size-9 place-items-center rounded-full text-ink-muted hover:bg-bench hover:text-ink"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </Hint>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="figure flex flex-wrap gap-x-4 text-[14px] text-ink-muted">
              <span>
                Received <span className="text-ink">{money(received, form.currency)}</span>
              </span>
              <span className={outstanding > 0 ? 'font-semibold text-hot-ink' : ''}>
                To receive {money(outstanding, form.currency)}
              </span>
            </p>
          </Panel>

          <Panel title="Costs and profit" className="gap-3">
            <dl className="flex flex-col gap-1.5 text-[15px]">
              <Row
                label={
                  profit.basis === 'recorded'
                    ? 'Materials (recorded stock use)'
                    : profit.basis === 'estimated'
                      ? 'Materials (estimate)'
                      : 'Materials'
                }
              >
                {profit.basis === 'none' ? (
                  <span className="text-ink-muted">not known yet</span>
                ) : (
                  money(profit.materials, form.currency)
                )}
              </Row>
            </dl>
            {profit.unconverted.length > 0 && (
              <Notice tone="attention" title="Costs in another currency">
                {profit.unconverted.map((m) => formatMoney(m)).join(' + ')} of stock was bought in
                another currency and is left out: set the CAD/BRL rate in Settings → Currency.
              </Notice>
            )}
            <div className="flex flex-col gap-2">
              <span className="label-mono text-ink-muted">Costs you paid for this sale</span>
              {form.costs.map((cost, index) => (
                <div key={cost.key} className="flex items-center gap-2">
                  <input
                    aria-label={`Cost ${index + 1}`}
                    value={cost.label}
                    placeholder="What it was"
                    onChange={(e) =>
                      set(
                        'costs',
                        form.costs.map((c) =>
                          c.key === cost.key ? { ...c, label: e.target.value } : c,
                        ),
                      )
                    }
                    className={cn(control, 'border-rule')}
                  />
                  <InlineMoney
                    value={cost.amount}
                    label={`Amount of cost ${index + 1}`}
                    onChange={(v) =>
                      set(
                        'costs',
                        form.costs.map((c) => (c.key === cost.key ? { ...c, amount: v } : c)),
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Remove cost ${index + 1}`}
                    onClick={() =>
                      set(
                        'costs',
                        form.costs.filter((c) => c.key !== cost.key),
                      )
                    }
                    className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-bench hover:text-ink"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap gap-1.5">
                {COST_SUGGESTIONS.filter((label) => !form.costs.some((c) => c.label === label)).map(
                  (label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() =>
                        set('costs', [...form.costs, { key: newKey(), label, amount: '' }])
                      }
                      className="h-8 rounded-full border-[1.5px] border-dashed border-[#B9CDD2] px-3 text-[13px] font-semibold text-teal hover:border-teal"
                    >
                      + {label}
                    </button>
                  ),
                )}
              </div>
            </div>
            <dl className="flex flex-col gap-1.5 border-t border-rule pt-3 text-[15px]">
              <Row label="Profit" strong>
                {money(profit.profit, form.currency)}
              </Row>
              {profit.margin !== null && (
                <Row label="Margin">
                  {(profit.margin / 1_000_000).toFixed(1)}%
                  {profit.basis !== 'recorded' && (
                    <span className="text-[13px] text-ink-muted">
                      {' '}
                      · {BASIS_LABEL[profit.basis]}
                    </span>
                  )}
                </Row>
              )}
            </dl>
            {sale?.order && (
              <p className="text-[13px] text-ink-muted">
                Stock is recorded on its order ({sale.order.title}); this sale uses that cost, so
                nothing is counted twice.
              </p>
            )}
          </Panel>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          {sale && !sale.cancelled && canManage && canArchive && (
            <Button
              variant="ghost"
              hint="For a sale that was called off: it stays on record but leaves the totals. Receipts and stock used are not reversed."
              onClick={() => setDialog('cancel')}
            >
              Cancel sale
            </Button>
          )}
          {sale && canManage && canArchive && (
            <DeleteAction
              title={`Delete ${sale.code}?`}
              description="For a sale entered by mistake: it is removed with its receipts. A linked order goes back to having its payment set by hand."
              confirmLabel="Delete sale"
              hint="Deletes it with its receipts, for a sale entered by mistake. Cancel keeps it on record."
              onDelete={async () => {
                try {
                  await api.delete(`/sales/${sale.id}`);
                  allowLeave();
                  await refresh();
                  toast.success(`${sale.code} deleted`);
                  void navigate('/sales');
                } catch (e) {
                  toast.error('Not deleted', e instanceof ApiError ? e.message : undefined);
                  throw e;
                }
              }}
            />
          )}
          {!locked && (
            <div className="ml-auto flex gap-3">
              <Button
                variant="ghost"
                onClick={() => void (sale ? navigate('/sales') : navigate(-1))}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={busy}
                hint={
                  isNew
                    ? 'Registers the sale. Nothing is deducted from stock: that happens when usage is recorded.'
                    : undefined
                }
              >
                {isNew ? 'Register sale' : 'Save changes'}
              </Button>
            </div>
          )}
        </div>
      </form>

      {dialog === 'customer' && (
        <CustomerDialog
          onClose={() => setDialog(null)}
          onSaved={(customer) => {
            setForm((f) => ({ ...f, customerKind: 'customer', customerId: customer.id }));
            setDialog(null);
          }}
        />
      )}
      {dialog === 'receipt' && sale && (
        <ReceiptDialog
          sale={sale}
          onClose={() => setDialog(null)}
          onSaved={async (result) => {
            await store(result);
            setDialog(null);
          }}
        />
      )}
      {dialog === 'usage' && sale && (
        <ConsumeDialog sale={{ id: sale.id, title: sale.code }} onClose={() => setDialog(null)} />
      )}
      {dialog === 'cancel' && sale && (
        <CancelSaleDialog
          sale={sale}
          onClose={() => setDialog(null)}
          onDone={async (result) => {
            await store(result);
            setDialog(null);
          }}
        />
      )}
    </>
  );
}

function CancelSaleDialog({
  sale,
  onClose,
  onDone,
}: {
  sale: SaleView;
  onClose: () => void;
  onDone: (sale: SaleView) => Promise<void>;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const submit = async () => {
    setBusy(true);
    try {
      await onDone(await api.post<SaleView>(`/sales/${sale.id}/cancel`, { reason }));
      toast.success(`${sale.code} cancelled`);
    } catch (e) {
      setError(e instanceof ApiError ? (e.fieldErrors().reason ?? e.message) : 'Not cancelled');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Cancel ${sale.code}?`}
      description="It stays on record with its receipts and leaves the totals. Refunds and returned stock are not recorded automatically."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void submit()}>
            Cancel sale
          </Button>
        </>
      }
    >
      <TextField
        label="Why"
        required
        placeholder="e.g. the customer gave up"
        value={reason}
        error={error}
        onChange={(e) => setReason(e.target.value)}
      />
    </Modal>
  );
}

const control =
  'h-10 w-full min-w-0 rounded-[10px] border-[1.5px] border-transparent bg-transparent px-2.5 text-[15px] outline-none hover:border-rule focus:border-teal aria-invalid:border-hot';

function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative flex items-center">
      <select {...props} className={cn(control, 'cursor-pointer appearance-none pr-8', className)}>
        {children}
      </select>
      <ChevronDown
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 text-ink-muted"
      />
    </span>
  );
}

function Prop({
  icon: Icon,
  label,
  htmlFor,
  top,
  children,
}: {
  icon: LucideIcon;
  label: string;
  htmlFor?: string;
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid gap-1 rounded-xl py-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3',
        top ? 'sm:items-start' : 'sm:items-center',
      )}
    >
      <label
        htmlFor={htmlFor}
        className={cn('flex items-center gap-2.5 text-[14px] text-ink-muted', top && 'sm:pt-2.5')}
      >
        <Icon size={17} aria-hidden="true" className="shrink-0 text-steel" />
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SmallField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={fieldId} className="label-mono text-[10px] text-ink-muted">
        {label}
      </label>
      <input
        id={fieldId}
        inputMode="decimal"
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
        className="figure h-10 w-full min-w-0 rounded-[10px] border-[1.5px] border-rule bg-surface px-2.5 text-[15px] outline-none focus:border-teal aria-invalid:border-hot"
      />
      <FieldError text={error} />
    </div>
  );
}

function InlineMoney({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      placeholder="0.00"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="figure h-9 w-28 rounded-[10px] border-[1.5px] border-rule bg-surface px-2.5 text-right text-[15px] outline-none focus:border-teal"
    />
  );
}

function Row({
  label,
  strong,
  children,
}: {
  label: ReactNode;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn('flex items-center justify-between gap-3', strong && 'text-[17px] font-bold')}
    >
      <dt className={strong ? '' : 'text-ink-muted'}>{label}</dt>
      <dd className="figure">{children}</dd>
    </div>
  );
}

function FieldError({ text }: { text?: string }) {
  return text ? <p className="px-1 text-[13px] text-hot-ink">{text}</p> : null;
}
