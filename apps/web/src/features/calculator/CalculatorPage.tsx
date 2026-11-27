import {
  calculate,
  formatMoney,
  toDecimalString,
  type CalcResult,
  type CalcWarning,
  type CalculationView,
  type Currency,
  type InventoryItemView,
  type PrinterView,
  type ProductView,
} from '@printbi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Button,
  cn,
  DeleteAction,
  EmptyState,
  IconButton,
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
import { useCan } from '../auth/account';
import { useProducts } from '../catalog/queries';
import { useInventoryItems } from '../inventory/queries';
import { usePrinters, useSettings } from '../settings/queries';
import {
  emptyForm,
  feeRow,
  filamentRow,
  fromSaved,
  laborRow,
  lotOptions,
  materialRow,
  parsePayload,
  printerRate,
  toPayload,
  type CalcForm,
} from './form';
import { calculationKeys, useCalculation, useRefreshCalculations } from './queries';

export function CalculatorPage() {
  const { calculationId = '' } = useParams();
  const canUse = useCan('finance:view');
  const { data: settings } = useSettings();
  const { data: printers } = usePrinters();
  const { data: items } = useInventoryItems();
  const { data: products } = useProducts();
  const { data: saved, isPending } = useCalculation(calculationId);

  if (!canUse) {
    return (
      <EmptyState title="The calculator needs financial access">
        It shows costs and margins. Ask your admin to turn on financial access for you.
      </EmptyState>
    );
  }
  if (!settings || !printers || !items || !products || (calculationId && isPending)) {
    return <PageLoader label="Loading the calculator" />;
  }
  if (calculationId && !saved) {
    return (
      <EmptyState
        title="Calculation not found"
        action={
          <Link to="/calculator/saved" className="font-semibold text-teal">
            Saved calculations
          </Link>
        }
      >
        It may have been deleted.
      </EmptyState>
    );
  }
  return (
    <CalculatorEditor
      key={saved?.id ?? 'new'}
      saved={saved}
      initial={saved ? fromSaved(saved) : emptyForm(settings, printers)}
      reset={() => emptyForm(settings, printers)}
      items={items}
      printers={printers}
      products={products}
      brlPerCad={settings.currency.brlPerCad}
    />
  );
}

interface EditorProps {
  saved?: CalculationView;
  initial: CalcForm;
  reset: () => CalcForm;
  items: InventoryItemView[];
  printers: PrinterView[];
  products: ProductView[];
  brlPerCad: number | null;
}

function CalculatorEditor({
  saved,
  initial,
  reset,
  items,
  printers,
  products,
  brlPerCad,
}: EditorProps) {
  const toast = useToast();
  const canManageMoney = useCan('finance:manage');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const refresh = useRefreshCalculations();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const payload = useMemo(
    () => toPayload(form, { items, printers, brlPerCad }),
    [form, items, printers, brlPerCad],
  );
  const parsed = useMemo(() => parsePayload(payload), [payload]);
  const result = useMemo(() => (parsed.success ? calculate(parsed.data) : null), [parsed]);
  const invalid = parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'));

  const set = <K extends keyof CalcForm>(key: K, value: CalcForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const patch = <
    K extends
      'filament' | 'energy' | 'labor' | 'machine' | 'materials' | 'risk' | 'fees' | 'pricing',
  >(
    key: K,
    value: Partial<CalcForm[K]>,
  ) => setForm((f) => ({ ...f, [key]: { ...f[key], ...value } }));

  const product = products.find((p) => p.id === form.productId);
  const pickProduct = (id: string) => {
    const picked = products.find((p) => p.id === id);
    setForm((f) => {
      const next = { ...f, productId: id };
      if (!picked) return next;
      if (!f.name.trim()) next.name = picked.name;
      const grams = picked.specs.filamentGrams;
      const [first, ...rest] = f.filament.lines;
      if (grams && first && !first.grams) {
        next.filament = {
          ...f.filament,
          lines: [{ ...first, grams: toDecimalString(grams) }, ...rest],
        };
      }
      return next;
    });
  };

  const save = async () => {
    if (!form.name.trim()) {
      setNameError('Name the calculation');
      return;
    }
    if (!parsed.success) {
      toast.error('Not saved', 'Some numbers are not valid. Check the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        productId: form.productId || null,
        notes: form.notes,
        input: payload,
        updateProductCost: form.updateProductCost && Boolean(form.productId),
      };
      const result = saved
        ? await api.put<CalculationView>(`/calculations/${saved.id}`, body)
        : await api.post<CalculationView>('/calculations', body);
      queryClient.setQueryData(calculationKeys.one(result.id), result);
      await refresh();
      if (body.updateProductCost) void queryClient.invalidateQueries({ queryKey: ['catalog'] });
      toast.success('Calculation saved', result.name);
      if (!saved) void navigate(`/calculator/${result.id}`, { replace: true });
    } catch (error) {
      toast.error('Not saved', error instanceof ApiError ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const currency = form.currency;
  const filamentLots = lotOptions(items.filter((i) => i.kind === 'filament'));
  const materialLots = lotOptions(items.filter((i) => i.kind !== 'filament'));
  const bad = (path: string) =>
    invalid.some((p) => p.startsWith(path)) ? 'Not a valid number' : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title={saved ? saved.name : 'Calculator'}
        description="Work out what a piece costs and what to charge. Nothing here touches your stock."
        actions={
          <>
            <Link
              to="/calculator/saved"
              className="inline-flex h-12 items-center rounded-full bg-teal-soft px-6 text-[15px] font-bold text-teal-ink hover:bg-[#d3eaee]"
            >
              Saved calculations
            </Link>
            {saved ? (
              <Button variant="ghost" onClick={() => void navigate('/calculator')}>
                New
              </Button>
            ) : (
              <Button
                variant="ghost"
                hint="Empties the form. Saved calculations are not touched."
                onClick={() => setForm(reset())}
              >
                Clear
              </Button>
            )}
          </>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Project">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Name"
                required
                value={form.name}
                error={nameError ?? undefined}
                placeholder="e.g. Dragon keychain, batch of 10"
                onChange={(e) => {
                  set('name', e.target.value);
                  setNameError(null);
                }}
              />
              <SelectField
                label="Product (optional)"
                value={form.productId}
                onChange={(e) => pickProduct(e.target.value)}
              >
                <option value="">None</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <TextField
                label="Pieces"
                inputMode="numeric"
                mono
                value={form.quantity}
                error={bad('quantity')}
                onChange={(e) => set('quantity', e.target.value)}
              />
              <TextField
                label="Print hours"
                inputMode="decimal"
                mono
                suffix="h"
                value={form.hours}
                onChange={(e) => set('hours', e.target.value)}
              />
              <TextField
                label="Minutes"
                inputMode="numeric"
                mono
                suffix="min"
                value={form.minutes}
                onChange={(e) => set('minutes', e.target.value)}
              />
              <SelectField
                label="Currency"
                value={currency}
                onChange={(e) => set('currency', e.target.value as Currency)}
              >
                <option value="CAD">CAD</option>
                <option value="BRL">BRL</option>
              </SelectField>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="label-mono mb-1.5 text-ink-muted">
                Time, grams and quantities are
              </legend>
              <Segmented
                value={form.basis}
                onChange={(basis) => set('basis', basis)}
                options={[
                  { value: 'unit', label: 'Per piece', hint: 'Multiplied by the number of pieces' },
                  {
                    value: 'batch',
                    label: 'For the whole batch',
                    hint: 'Already the total: not multiplied again',
                  },
                ]}
              />
            </fieldset>
          </Panel>

          <Section
            title="Filament"
            enabled={form.filament.enabled}
            onToggle={(enabled) => patch('filament', { enabled })}
            total={result?.sections.filament}
            currency={currency}
          >
            {form.filament.lines.map((line, index) => {
              const update = (value: Partial<typeof line>) =>
                patch('filament', {
                  lines: form.filament.lines.map((l) =>
                    l.key === line.key ? { ...l, ...value } : l,
                  ),
                });
              const option = filamentLots.find(
                (o) => o.item.id === line.itemId && o.lot.id === line.lotId,
              );
              return (
                <LineRow
                  key={line.key}
                  cost={result?.lines.filament[index]}
                  currency={currency}
                  onRemove={
                    form.filament.lines.length > 1
                      ? () =>
                          patch('filament', {
                            lines: form.filament.lines.filter((l) => l.key !== line.key),
                          })
                      : undefined
                  }
                >
                  <SourceToggle value={line.source} onChange={(source) => update({ source })} />
                  {line.source === 'stock' ? (
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                      <SelectField
                        label="Roll"
                        value={option?.value ?? ''}
                        onChange={(e) => {
                          const [itemId = '', lotId = ''] = e.target.value.split(':');
                          update({ itemId, lotId });
                        }}
                      >
                        <option value="">Pick a roll</option>
                        {filamentLots.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.item.name} · {o.lot.label} · {grams(o.lot.remaining)} left
                            {o.lot.unitCost
                              ? ` · ${formatMoney(o.lot.unitCost, { precision: 'unit' })}/g`
                              : ''}
                          </option>
                        ))}
                      </SelectField>
                      <TextField
                        label="Grams"
                        inputMode="decimal"
                        mono
                        suffix="g"
                        value={line.grams}
                        error={bad(`filament.lines.${index}`)}
                        onChange={(e) => update({ grams: e.target.value })}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <TextField
                        label="Material"
                        className="col-span-2 md:col-span-1"
                        placeholder="e.g. PETG white"
                        value={line.label}
                        onChange={(e) => update({ label: e.target.value })}
                      />
                      <TextField
                        label="Grams"
                        inputMode="decimal"
                        mono
                        suffix="g"
                        value={line.grams}
                        onChange={(e) => update({ grams: e.target.value })}
                      />
                      <TextField
                        label="Spool weight"
                        inputMode="decimal"
                        mono
                        suffix="g"
                        value={line.spoolGrams}
                        onChange={(e) => update({ spoolGrams: e.target.value })}
                      />
                      <TextField
                        label="Spool price"
                        inputMode="decimal"
                        mono
                        suffix={line.spoolCurrency}
                        value={line.spoolPrice}
                        onChange={(e) => update({ spoolPrice: e.target.value })}
                      />
                    </div>
                  )}
                </LineRow>
              );
            })}
            <AddButton
              onClick={() =>
                patch('filament', { lines: [...form.filament.lines, filamentRow({}, currency)] })
              }
            >
              Add filament
            </AddButton>
          </Section>

          <div className="grid items-start gap-5 2xl:grid-cols-2">
            <Section
              title="Energy"
              enabled={form.energy.enabled}
              onToggle={(enabled) => patch('energy', { enabled })}
              total={result?.sections.energy}
              currency={currency}
              note={
                result && form.energy.enabled
                  ? `${toDecimalString(Math.round(result.kwh / 1000) * 1000)} kWh`
                  : undefined
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Average power"
                  inputMode="decimal"
                  mono
                  suffix="W"
                  value={form.energy.watts}
                  onChange={(e) => patch('energy', { watts: e.target.value })}
                />
                <TextField
                  label="Price"
                  inputMode="decimal"
                  mono
                  suffix="/kWh"
                  value={form.energy.price}
                  onChange={(e) => patch('energy', { price: e.target.value })}
                />
              </div>
              <p className="text-[13px] text-ink-muted">
                kWh = W ÷ 1000 × print hours. An estimated average draw.
              </p>
            </Section>

            <Section
              title="Machine"
              enabled={form.machine.enabled}
              onToggle={(enabled) => patch('machine', { enabled })}
              total={result?.sections.machine}
              currency={currency}
              note={
                result?.machineRate
                  ? `${formatMoney({ amount: result.machineRate, currency }, { precision: 'unit' })}/h`
                  : undefined
              }
            >
              <SelectField
                label="Cost from"
                value={form.machine.mode}
                onChange={(e) =>
                  patch('machine', { mode: e.target.value as CalcForm['machine']['mode'] })
                }
              >
                <option value="printer">One of my printers</option>
                <option value="rate">A cost per hour</option>
                <option value="recovery">A payback plan</option>
              </SelectField>
              {form.machine.mode === 'printer' &&
                (printers.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    No printers yet.{' '}
                    <Link to="/settings/printers" className="font-semibold text-teal">
                      Add one in Settings
                    </Link>
                    .
                  </p>
                ) : (
                  <>
                    <SelectField
                      label="Printer"
                      value={form.machine.printerId}
                      onChange={(e) => {
                        const printer = printers.find((p) => p.id === e.target.value);
                        patch('machine', { printerId: e.target.value });
                        if (printer?.powerWatts)
                          patch('energy', { watts: String(printer.powerWatts) });
                      }}
                    >
                      {printers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </SelectField>
                    {!printerRate(printers.find((p) => p.id === form.machine.printerId)) && (
                      <p className="text-[13px] text-hot-ink">
                        This printer has no cost per hour or payback plan yet.
                      </p>
                    )}
                  </>
                ))}
              {form.machine.mode === 'rate' && (
                <TextField
                  label="Cost per print hour"
                  inputMode="decimal"
                  mono
                  suffix={currency}
                  value={form.machine.rate}
                  onChange={(e) => patch('machine', { rate: e.target.value })}
                />
              )}
              {form.machine.mode === 'recovery' && (
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Purchase price"
                    inputMode="decimal"
                    mono
                    suffix={currency}
                    className="col-span-2"
                    value={form.machine.purchase}
                    onChange={(e) => patch('machine', { purchase: e.target.value })}
                  />
                  <TextField
                    label="Pay back in"
                    inputMode="decimal"
                    mono
                    suffix="years"
                    value={form.machine.years}
                    onChange={(e) => patch('machine', { years: e.target.value })}
                  />
                  <TextField
                    label="Days a year"
                    inputMode="decimal"
                    mono
                    value={form.machine.daysPerYear}
                    onChange={(e) => patch('machine', { daysPerYear: e.target.value })}
                  />
                  <TextField
                    label="Hours a day"
                    inputMode="decimal"
                    mono
                    value={form.machine.hoursPerDay}
                    onChange={(e) => patch('machine', { hoursPerDay: e.target.value })}
                  />
                  <TextField
                    label="Repairs"
                    inputMode="decimal"
                    mono
                    suffix={form.machine.maintenanceKind === 'percent' ? '%' : currency}
                    value={form.machine.maintenance}
                    onChange={(e) => patch('machine', { maintenance: e.target.value })}
                  />
                </div>
              )}
              <p className="text-[13px] text-ink-muted">
                A share of what the printer costs over its life, not money spent today.
              </p>
            </Section>
          </div>

          <Section
            title="Labor"
            enabled={form.labor.enabled}
            onToggle={(enabled) => patch('labor', { enabled })}
            total={result?.sections.labor}
            currency={currency}
          >
            {form.labor.lines.map((line, index) => {
              const update = (value: Partial<typeof line>) =>
                patch('labor', {
                  lines: form.labor.lines.map((l) => (l.key === line.key ? { ...l, ...value } : l)),
                });
              return (
                <LineRow
                  key={line.key}
                  cost={result?.lines.labor[index]}
                  currency={currency}
                  onRemove={() =>
                    patch('labor', { lines: form.labor.lines.filter((l) => l.key !== line.key) })
                  }
                >
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
                    <TextField
                      label="Activity"
                      className="col-span-2 md:col-span-1"
                      value={line.label}
                      onChange={(e) => update({ label: e.target.value })}
                    />
                    <TextField
                      label="Hours"
                      inputMode="decimal"
                      mono
                      value={line.hours}
                      onChange={(e) => update({ hours: e.target.value })}
                    />
                    <TextField
                      label="Minutes"
                      inputMode="numeric"
                      mono
                      value={line.minutes}
                      onChange={(e) => update({ minutes: e.target.value })}
                    />
                    <TextField
                      label="Rate"
                      inputMode="decimal"
                      mono
                      suffix={`${currency}/h`}
                      className="col-span-2 md:col-span-1"
                      value={line.rate}
                      onChange={(e) => update({ rate: e.target.value })}
                    />
                  </div>
                </LineRow>
              );
            })}
            <AddButton
              onClick={() =>
                patch('labor', {
                  lines: [...form.labor.lines, laborRow('', form.labor.lines[0]?.rate ?? '')],
                })
              }
            >
              Add activity
            </AddButton>
          </Section>

          <Section
            title="Materials and consumables"
            description="Screws, magnets, paint, glue, boxes, shipping…"
            enabled={form.materials.enabled}
            onToggle={(enabled) => patch('materials', { enabled })}
            total={result?.sections.materials}
            currency={currency}
          >
            {form.materials.lines.map((line, index) => {
              const update = (value: Partial<typeof line>) =>
                patch('materials', {
                  lines: form.materials.lines.map((l) =>
                    l.key === line.key ? { ...l, ...value } : l,
                  ),
                });
              const option = materialLots.find(
                (o) => o.item.id === line.itemId && o.lot.id === line.lotId,
              );
              return (
                <LineRow
                  key={line.key}
                  cost={result?.lines.materials[index]}
                  currency={currency}
                  onRemove={() =>
                    patch('materials', {
                      lines: form.materials.lines.filter((l) => l.key !== line.key),
                    })
                  }
                >
                  <SourceToggle value={line.source} onChange={(source) => update({ source })} />
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))]">
                    {line.source === 'stock' ? (
                      <SelectField
                        label="Lot"
                        className="col-span-2 md:col-span-1"
                        value={option?.value ?? ''}
                        onChange={(e) => {
                          const [itemId = '', lotId = ''] = e.target.value.split(':');
                          update({ itemId, lotId });
                        }}
                      >
                        <option value="">Pick from stock</option>
                        {materialLots.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.item.name} · {o.lot.label}
                            {o.lot.unitCost
                              ? ` · ${formatMoney(o.lot.unitCost, { precision: 'unit' })} each`
                              : ''}
                          </option>
                        ))}
                      </SelectField>
                    ) : (
                      <TextField
                        label="Item"
                        className="col-span-2 md:col-span-1"
                        placeholder="e.g. Magnets"
                        value={line.label}
                        onChange={(e) => update({ label: e.target.value })}
                      />
                    )}
                    <TextField
                      label="Quantity"
                      inputMode="decimal"
                      mono
                      value={line.quantity}
                      onChange={(e) => update({ quantity: e.target.value })}
                    />
                    {line.source === 'stock' && option?.lot.unitCost ? (
                      <TextField
                        label="Unit price"
                        mono
                        readOnly
                        value={formatMoney(option.lot.unitCost, { precision: 'unit' })}
                      />
                    ) : (
                      <TextField
                        label="Unit price"
                        inputMode="decimal"
                        mono
                        suffix={line.currency}
                        value={line.unitPrice}
                        onChange={(e) => update({ unitPrice: e.target.value })}
                      />
                    )}
                  </div>
                </LineRow>
              );
            })}
            <AddButton
              onClick={() =>
                patch('materials', { lines: [...form.materials.lines, materialRow(currency)] })
              }
            >
              Add item
            </AddButton>
          </Section>

          <div className="grid items-start gap-5 2xl:grid-cols-2">
            <Section
              title="Risk allowance"
              description="A cushion for failed prints and waste. An estimate: real losses are recorded in stock."
              enabled={form.risk.enabled}
              onToggle={(enabled) => patch('risk', { enabled })}
              total={result?.sections.risk}
              currency={currency}
            >
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Allowance"
                  inputMode="decimal"
                  mono
                  suffix="%"
                  value={form.risk.percent}
                  onChange={(e) => patch('risk', { percent: e.target.value })}
                />
                <SelectField
                  label="Applied on"
                  value={form.risk.base}
                  onChange={(e) =>
                    patch('risk', { base: e.target.value as CalcForm['risk']['base'] })
                  }
                >
                  <option value="filament">Filament only</option>
                  <option value="materials">All materials</option>
                  <option value="total">Total cost</option>
                </SelectField>
              </div>
            </Section>

            <Section
              title="Fees and taxes"
              description="Nothing is assumed: add only what applies to you."
              enabled={form.fees.enabled}
              onToggle={(enabled) => patch('fees', { enabled })}
              total={result?.sections.fees}
              currency={currency}
              note={
                result && result.priceFees.unit > 0
                  ? `+ ${formatMoney({ amount: result.priceFees.unit, currency })} from the price`
                  : undefined
              }
            >
              {form.fees.lines.map((fee) => {
                const update = (value: Partial<typeof fee>) =>
                  patch('fees', {
                    lines: form.fees.lines.map((l) => (l.key === fee.key ? { ...l, ...value } : l)),
                  });
                return (
                  <LineRow
                    key={fee.key}
                    onRemove={() =>
                      patch('fees', { lines: form.fees.lines.filter((l) => l.key !== fee.key) })
                    }
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <TextField
                        label="Name"
                        placeholder="e.g. Etsy, card, HST"
                        className="col-span-2"
                        value={fee.label}
                        onChange={(e) => update({ label: e.target.value })}
                      />
                      <SelectField
                        label="Kind"
                        value={fee.kind}
                        onChange={(e) => update({ kind: e.target.value as typeof fee.kind })}
                      >
                        <option value="price_percent">% taken from the price</option>
                        <option value="cost_percent">% added to the cost</option>
                        <option value="fixed">Fixed amount</option>
                        <option value="tax_added">Tax added for the customer</option>
                      </SelectField>
                      <TextField
                        label="Value"
                        inputMode="decimal"
                        mono
                        suffix={fee.kind === 'fixed' ? currency : '%'}
                        value={fee.value}
                        onChange={(e) => update({ value: e.target.value })}
                      />
                    </div>
                  </LineRow>
                );
              })}
              <AddButton onClick={() => patch('fees', { lines: [...form.fees.lines, feeRow()] })}>
                Add fee or tax
              </AddButton>
            </Section>
          </div>

          <Panel title="Price">
            <Segmented
              value={form.pricing.method}
              onChange={(method) => patch('pricing', { method })}
              options={[
                { value: 'margin', label: 'Margin', hint: 'Profit as a share of the price' },
                { value: 'markup', label: 'Markup', hint: 'Profit as a share of the cost' },
                { value: 'manual', label: 'My price', hint: 'See what it leaves you' },
              ]}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {form.pricing.method === 'manual' ? (
                <TextField
                  label="Price per piece"
                  inputMode="decimal"
                  mono
                  suffix={currency}
                  value={form.pricing.unitPrice}
                  onChange={(e) => patch('pricing', { unitPrice: e.target.value })}
                />
              ) : (
                <TextField
                  label={
                    form.pricing.method === 'margin' ? 'Margin on the price' : 'Markup on the cost'
                  }
                  inputMode="decimal"
                  mono
                  suffix="%"
                  value={form.pricing.percent}
                  onChange={(e) => patch('pricing', { percent: e.target.value })}
                />
              )}
            </div>
            <p className="text-[13px] text-ink-muted">
              They are not the same: on a cost of 60, a 40% <strong>margin</strong> gives a price of
              100 (40 of 100 is profit), while a 40% <strong>markup</strong> gives 84 (60 + 40% of
              60).
            </p>
          </Panel>

          <Panel title="Notes">
            <TextAreaField
              label="Notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Panel>
        </div>

        <aside
          id="result"
          className="flex scroll-mt-6 flex-col gap-5 lg:sticky lg:top-6"
          aria-label="Result"
        >
          <Summary result={result} currency={currency} />
          <Panel>
            {product && (
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-teal"
                  checked={form.updateProductCost}
                  onChange={(e) => set('updateProductCost', e.target.checked)}
                />
                <span>
                  Use the unit cost as the estimated cost of <strong>{product.name}</strong>
                </span>
              </label>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {saved && (
                <DeleteAction
                  title={`Delete ${saved.name}?`}
                  description="The saved calculation is removed. Products and quotes made from it keep their own values."
                  confirmLabel="Delete calculation"
                  hint="Deletes this saved calculation. Products and quotes made from it keep their values."
                  onDelete={async () => {
                    try {
                      await api.delete(`/calculations/${saved.id}`);
                    } catch (e) {
                      toast.error('Not deleted', e instanceof ApiError ? e.message : undefined);
                      throw e;
                    }
                    toast.success('Calculation deleted', saved.name);
                    await refresh();
                    void navigate('/calculator/saved', { replace: true });
                  }}
                />
              )}
              <Button loading={saving} onClick={() => void save()}>
                {saved ? 'Save changes' : 'Save calculation'}
              </Button>
            </div>
            {saved ? (
              <div className="flex flex-col gap-2">
                <Link
                  to={`/quotes/new?calculation=${saved.id}`}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-teal-soft px-5 text-sm font-bold text-teal-ink hover:bg-[#d3eaee]"
                >
                  Create a quote from it
                </Link>
                {canManageMoney && (
                  <Hint text="Opens a new sale with this calculation's price and estimated cost, to review before saving. Nothing is deducted from stock.">
                    <Link
                      to={`/sales/new?calculation=${saved.id}`}
                      className="inline-flex h-11 items-center justify-center rounded-full bg-surface px-5 text-sm font-bold text-teal hover:bg-teal-soft"
                    >
                      Register a sale from it
                    </Link>
                  </Hint>
                )}
              </div>
            ) : (
              <p className="text-right text-[12px] text-ink-muted">
                Save it to make a quote or a sale from it.
              </p>
            )}
          </Panel>
        </aside>
      </div>
      <MobileResultBar result={result} currency={currency} />
    </>
  );
}

const grams = (micro: number) => `${Math.round(micro / 1_000_000).toLocaleString('en-CA')} g`;

function Section({
  title,
  description,
  enabled,
  onToggle,
  total,
  currency,
  note,
  children,
}: {
  title: string;
  description?: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  total?: number;
  currency: Currency;
  note?: string;
  children: ReactNode;
}) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-3">
          <Toggle label={`Include ${title.toLowerCase()}`} checked={enabled} onChange={onToggle} />
          {title}
        </span>
      }
      actions={
        enabled && total !== undefined ? (
          <span className="flex flex-col items-end">
            <span className="figure text-lg font-medium">
              {formatMoney({ amount: total, currency })}
            </span>
            {note && <span className="figure text-[12px] text-ink-muted">{note}</span>}
          </span>
        ) : undefined
      }
      className={cn(!enabled && 'gap-0')}
    >
      {/* Below the header, so the total always sits beside the title. */}
      {description && (
        <p className={cn('-mt-2 text-sm text-ink-muted', !enabled && 'mt-1')}>{description}</p>
      )}
      {enabled && children}
    </Panel>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-teal' : 'bg-rule',
      )}
    >
      <span
        className={cn(
          'block size-4.5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; hint: string }[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-col items-start gap-0.5 rounded-[var(--radius-tile)] border-[1.5px] px-4 py-2.5 text-left',
            value === o.value ? 'border-teal bg-teal-soft' : 'border-rule hover:bg-bench',
          )}
        >
          <span className="font-bold">{o.label}</span>
          <span className="text-[13px] text-ink-muted">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

function SourceToggle({
  value,
  onChange,
}: {
  value: 'stock' | 'manual';
  onChange: (v: 'stock' | 'manual') => void;
}) {
  return (
    <div
      className="flex gap-1 self-start rounded-full bg-bench p-1"
      role="radiogroup"
      aria-label="Where it comes from"
    >
      {(['stock', 'manual'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'h-8 rounded-full px-3 text-[13px] font-bold',
            value === v ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
          )}
        >
          {v === 'stock' ? 'From stock' : 'Typed in'}
        </button>
      ))}
    </div>
  );
}

function LineRow({
  children,
  cost,
  currency,
  onRemove,
}: {
  children: ReactNode;
  cost?: number | null;
  currency?: Currency;
  onRemove?: () => void;
}) {
  return (
    <div className="flex gap-3 border-t border-rule-soft pt-4 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-1 flex-col gap-3">{children}</div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2 pt-1">
        {cost !== undefined && currency && (
          <span className="figure text-sm text-ink-muted">
            {cost === null ? '—' : formatMoney({ amount: cost, currency })}
          </span>
        )}
        {onRemove && (
          <IconButton label="Remove line" onClick={onRemove}>
            <Trash2 size={15} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-1.5 self-start rounded-full border-[1.5px] border-dashed border-rule px-4 text-sm font-semibold text-ink-muted hover:border-teal hover:text-teal"
    >
      <Plus size={15} aria-hidden="true" /> {children}
    </button>
  );
}

const SECTION_LABELS: [keyof CalcResult['sections'], string][] = [
  ['filament', 'Filament'],
  ['materials', 'Materials'],
  ['energy', 'Energy'],
  ['labor', 'Labor'],
  ['machine', 'Machine'],
  ['risk', 'Risk'],
  ['fees', 'Fees'],
];

/** A stock quantity for a warning: grams for filament, plain units otherwise. */
const amount = (micro: number, section: 'filament' | 'materials') =>
  `${toDecimalString(Math.round(micro / 10_000) * 10_000)}${section === 'filament' ? ' g' : ''}`;

function warningText(w: CalcWarning, currency: Currency): string {
  switch (w.code) {
    case 'stock_short':
      return `${w.section === 'filament' ? 'Filament' : 'Material'} line ${w.index + 1} needs ${amount(w.needed, w.section)} but only ${amount(w.available, w.section)} is left. Fine for a quote; buy more before printing.`;
    case 'needs_rate':
      return `A ${w.currency} line can't be added to ${currency} without the CAD/BRL rate. Set it in Settings → Currency.`;
    case 'invalid_line':
      return `A ${w.section} line has no cost yet.`;
    case 'machine_rate_missing':
      return 'The machine cost could not be worked out. Check the printer’s cost or the payback plan.';
    case 'margin_too_high':
      return 'Margin plus fees taken from the price must stay below 100%.';
    case 'below_cost':
      return 'This price is below the cost: you would lose money on each piece.';
  }
}

function Summary({ result, currency }: { result: CalcResult | null; currency: Currency }) {
  const m = (amount: number) => formatMoney({ amount, currency });
  if (!result) {
    return (
      <Panel>
        <Notice tone="attention" title="Check the numbers">
          Some fields don’t hold a valid number yet.
        </Notice>
      </Panel>
    );
  }
  const max = Math.max(1, ...SECTION_LABELS.map(([k]) => result.sections[k]));
  const pct = (v: number | null) => (v === null ? '—' : `${(v / 1_000_000).toFixed(1)}%`);
  return (
    <Panel className="gap-4">
      <div className="flex flex-col gap-1">
        <span className="label-mono text-ink-muted">Suggested price · per piece</span>
        <span className="figure text-[34px] leading-none font-medium">
          {result.price ? m(result.price.unit) : '—'}
        </span>
        {result.price && result.quantity > 1 && (
          <span className="figure text-sm text-ink-muted">
            {m(result.price.batch)} for {result.quantity} pieces
          </span>
        )}
        {result.customerPays && result.taxAdded.unit > 0 && (
          <span className="figure text-sm text-ink-muted">
            Customer pays {m(result.customerPays.unit)} with tax
          </span>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-2 rounded-[var(--radius-tile)] bg-bench p-3 text-center">
        <div>
          <dt className="label-mono text-[11px] text-ink-muted">Profit</dt>
          <dd
            className={cn(
              'figure font-medium',
              result.profit && result.profit.unit < 0 && 'text-hot-ink',
            )}
          >
            {result.profit ? m(result.profit.unit) : '—'}
          </dd>
        </div>
        <div>
          <dt className="label-mono text-[11px] text-ink-muted">Margin</dt>
          <dd className="figure font-medium">{pct(result.marginPercent)}</dd>
        </div>
        <div>
          <dt className="label-mono text-[11px] text-ink-muted">Markup</dt>
          <dd className="figure font-medium">{pct(result.markupPercent)}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-2">
        {SECTION_LABELS.filter(([k]) => result.sections[k] > 0).map(([key, label]) => (
          <div
            key={key}
            className="grid grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-2 text-sm"
          >
            <span className="text-ink-muted">{label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-rule-soft">
              <span
                className="block h-full rounded-full bg-teal"
                style={{ width: `${(result.sections[key] / max) * 100}%` }}
              />
            </span>
            <span className="figure">{m(result.sections[key])}</span>
          </div>
        ))}
      </div>
      <dl className="flex flex-col gap-1.5 border-t border-rule-soft pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Cost of the batch</dt>
          <dd className="figure">{m(result.batchCost)}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>Cost per piece</dt>
          <dd className="figure">{m(result.unitCost)}</dd>
        </div>
        {result.priceFees.unit > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink-muted">Fees taken from the price</dt>
            <dd className="figure">{m(result.priceFees.unit)}</dd>
          </div>
        )}
        {result.profit && result.quantity > 1 && (
          <div className="flex justify-between">
            <dt className="text-ink-muted">Profit on the batch</dt>
            <dd className="figure">{m(result.profit.batch)}</dd>
          </div>
        )}
      </dl>
      {result.warnings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {result.warnings.map((w, i) => (
            <li
              key={i}
              className="rounded-[14px] border-[1.5px] border-hot-line bg-hot-tint px-3 py-2 text-[13px] text-hot-ink"
            >
              {warningText(w, currency)}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Phones: the result follows the form at the bottom of the screen, a tap away from the details. */
function MobileResultBar({ result, currency }: { result: CalcResult | null; currency: Currency }) {
  const m = (amount: number) => formatMoney({ amount, currency });
  return (
    <>
      <div aria-hidden="true" className="h-20 lg:hidden" />
      <a
        href="#result"
        className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between gap-3 rounded-full bg-ink px-5 py-3 text-white shadow-[var(--shadow-pop)] lg:hidden"
      >
        <span className="flex flex-col">
          <span className="label-mono text-[11px] text-white/70">Per piece</span>
          <span className="figure text-lg leading-tight font-medium">
            {result?.price ? m(result.price.unit) : '—'}
          </span>
        </span>
        <span className="flex flex-col items-end">
          <span className="label-mono text-[11px] text-white/70">Profit</span>
          <span className="figure leading-tight">
            {result?.profit ? m(result.profit.unit) : '—'}
          </span>
        </span>
      </a>
    </>
  );
}
