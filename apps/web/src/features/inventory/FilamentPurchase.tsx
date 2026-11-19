import {
  formatMoney,
  multiply,
  purchaseLineSchema,
  purchaseSchema,
  toMicro,
  type CategoryView,
  type Currency,
  type FilamentProductView,
  type InventoryItemView,
  type PaymentMethod,
} from '@printbi/shared';
import { Copy, Minus, Palette, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import {
  Badge,
  Button,
  cn,
  EmptyState,
  Modal,
  Notice,
  Panel,
  SelectField,
  SpoolGauge,
  SwitchField,
  TextField,
  useToast,
} from '../../design-system';
import { filamentStops } from '../../design-system/ColorSwatch';
import { api, ApiError } from '../../lib/api';
import { showGrams } from '../../lib/quantity';
import { useIdempotencyKey } from '../../lib/useIdempotencyKey';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { useCan } from '../auth/account';
import { ColorPicker, type ColorValue } from './ColorPicker';
import {
  defaultExpenseCategory,
  emptyItem,
  emptyLot,
  formPath,
  suggestedName,
  toItemPayload,
  today,
  type ItemForm,
} from './forms';
import { ItemFields, type InventoryForm } from './ItemFields';
import { RollWarningField } from './LotFields';
import { useInventoryItems, useRefreshInventory } from './queries';

/** One line of the purchase: a filament and color, and how many identical rolls came. */
export interface CartLine {
  id: number;
  item: ItemForm;
  rolls: number;
  originalQuantity: string;
  price: string;
  currency: Currency;
  lowStockThreshold: string;
}

interface PurchaseDetails {
  purchasedAt: string;
  store: string;
  recordExpense: boolean;
  expenseCategoryId: string;
  paymentState: 'paid' | 'pending';
  paidAt: string;
  method: PaymentMethod;
}

/** What the bulk bar can set on every selected line; empty fields are left alone. */
interface BulkChange {
  price: string;
  currency: Currency;
  originalQuantity: string;
  rolls: string;
  lowStockThreshold: string;
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());
const lineName = (line: CartLine) => line.item.name.trim() || suggestedName(line.item);

const isPositiveDecimal = (value: string) => {
  try {
    return toMicro(value.trim()) > 0;
  } catch {
    return false;
  }
};

export function linePayload(line: CartLine, withCosts: boolean) {
  const price = withCosts ? orNull(line.price) : null;
  return {
    item: toItemPayload({ ...line.item, name: lineName(line) }),
    rolls: line.rolls,
    originalQuantity: line.originalQuantity,
    totalCost: price ? { amount: price, currency: line.currency } : null,
    lowStockThreshold: orNull(line.lowStockThreshold),
    notes: '',
  };
}

/** Same rule as the server: material, brand, color and diameter decide "same filament". */
export function existingMatch(
  items: InventoryItemView[],
  f: ItemForm,
): InventoryItemView | undefined {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return items.find((i) => {
    const g = i.filament;
    if (!g || i.archived) return false;
    const color = f.colorKey ? g.colorKey === f.colorKey : !g.colorKey && g.colorHex === f.colorHex;
    return (
      color &&
      same(g.materialType, f.materialType) &&
      same(g.brand, f.brand) &&
      g.diameterMm === Number(f.diameterMm || 1.75)
    );
  });
}

/** Applies the filled bulk fields to one line. */
export function applyBulk(line: CartLine, change: BulkChange): CartLine {
  const rolls = Number(change.rolls);
  return {
    ...line,
    ...(change.price.trim() && { price: change.price.trim(), currency: change.currency }),
    ...(change.originalQuantity.trim() && { originalQuantity: change.originalQuantity.trim() }),
    ...(Number.isInteger(rolls) && rolls >= 1 && rolls <= 50 && { rolls }),
    ...(change.lowStockThreshold.trim() && { lowStockThreshold: change.lowStockThreshold.trim() }),
  };
}

/** Editor fields → schema paths → form fields. */
const editorPath = (path: string) =>
  formPath(path)
    .replace(/^originalQuantity$/, 'lot.originalQuantity')
    .replace(/^totalCost(\.amount)?$/, 'lot.price')
    .replace(/^lowStockThreshold$/, 'lot.lowStockThreshold');

interface FilamentPurchaseProps {
  currency: Currency;
  categories: CategoryView[];
  products: FilamentProductView[];
}

/**
 * A whole order on one screen: the roll set-up stays in a sticky column on the left, the
 * rolls appear as a grid on the right. Rolls can be selected one by one or all at once to
 * change price, weight, quantity or warning together. Everything is saved in one go.
 */
export function FilamentPurchase({ currency, categories, products }: FilamentPurchaseProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const refresh = useRefreshInventory();
  const canManageFinance = useCan('finance:manage');
  const idempotency = useIdempotencyKey();
  const { data: existing = [] } = useInventoryItems({ kind: 'filament' });

  const blankEditor = (): InventoryForm => ({
    item: emptyItem('filament'),
    hasStock: true,
    lot: emptyLot(currency),
    rolls: '1',
  });
  const editor = useForm<InventoryForm>({ defaultValues: blankEditor() });
  const details = useForm<PurchaseDetails>({
    defaultValues: {
      purchasedAt: today(),
      store: '',
      recordExpense: true,
      expenseCategoryId: defaultExpenseCategory(categories, 'filament'),
      paymentState: 'paid',
      paidAt: today(),
      method: 'credit',
    },
  });
  const detailValues = useWatch({ control: details.control });
  const editorErrors = editor.formState.errors;

  const [cart, setCart] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [recoloring, setRecoloring] = useState<CartLine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const nextId = () => Math.max(0, ...cart.map((l) => l.id)) + 1;

  const { prompt: guard, allowLeave } = useUnsavedChangesGuard(
    cart.length > 0 || editor.formState.isDirty,
  );

  const toLine = (values: InventoryForm, id: number): CartLine => ({
    id,
    item: { ...values.item },
    rolls: Math.max(1, Math.floor(Number(values.rolls) || 1)),
    originalQuantity: values.lot.originalQuantity,
    price: values.lot.price,
    currency: values.lot.currency,
    lowStockThreshold: values.lot.lowStockThreshold,
  });

  const loadIntoEditor = (line: CartLine) =>
    editor.reset({
      ...blankEditor(),
      item: { ...line.item },
      rolls: String(line.rolls),
      lot: {
        ...emptyLot(line.currency),
        originalQuantity: line.originalQuantity,
        price: line.price,
        currency: line.currency,
        lowStockThreshold: line.lowStockThreshold,
      },
    });

  /** On narrow screens the editor sits above the grid: bring it into view to edit. */
  const showEditor = () =>
    requestAnimationFrame(() => {
      const box = editorRef.current?.getBoundingClientRect();
      if (box && box.top >= 0 && box.top < window.innerHeight / 2) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      editorRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });

  /** Adds (or updates) the line; then clears only the color so the next one is quick. */
  const addToCart = editor.handleSubmit((values) => {
    const line = toLine(values, editingId ?? nextId());
    let valid = true;
    if (!isPositiveDecimal(line.price)) {
      editor.setError('lot.price', { message: 'Enter the price paid for each roll' });
      valid = false;
    }
    const check = purchaseLineSchema.safeParse(linePayload(line, true));
    if (!check.success) {
      for (const issue of check.error.issues) {
        editor.setError(editorPath(issue.path.map(String).join('.')) as never, {
          message: issue.message,
        });
      }
      valid = false;
    }
    if (!valid) return;
    setCart((all) =>
      editingId ? all.map((l) => (l.id === editingId ? line : l)) : [...all, line],
    );
    setEditingId(null);
    editor.reset({
      ...values,
      rolls: '1',
      item: { ...values.item, colorKey: '', colorName: '', colorHex: '', name: '' },
    });
  });

  const editLine = (line: CartLine) => {
    setEditingId(line.id);
    loadIntoEditor(line);
    showEditor();
  };

  /** The usual next step after buying several colors: copy the roll and pick another color. */
  const duplicate = (line: CartLine) => {
    const copy = { ...line, id: nextId(), item: { ...line.item } };
    setCart((all) => {
      const index = all.findIndex((l) => l.id === line.id);
      return [...all.slice(0, index + 1), copy, ...all.slice(index + 1)];
    });
    setRecoloring(copy);
  };

  /** New color for one line; an automatic name follows the color, a typed one is kept. */
  const recolor = (lineId: number, color: ColorValue) =>
    setCart((all) =>
      all.map((l) => {
        if (l.id !== lineId) return l;
        const automatic = !l.item.name.trim() || l.item.name.trim() === suggestedName(l.item);
        return { ...l, item: { ...l.item, ...color, name: automatic ? '' : l.item.name } };
      }),
    );

  const remove = (ids: number[]) => {
    setCart((all) => all.filter((l) => !ids.includes(l.id)));
    setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))));
    if (editingId !== null && ids.includes(editingId)) setEditingId(null);
  };

  const changeRolls = (id: number, delta: number) =>
    setCart((all) =>
      all.map((l) =>
        l.id === id ? { ...l, rolls: Math.min(50, Math.max(1, l.rolls + delta)) } : l,
      ),
    );

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = cart.length > 0 && selected.size === cart.length;

  const missingPrice = cart.filter((l) => !isPositiveDecimal(l.price));
  const totals = (() => {
    const rolls = cart.reduce((sum, l) => sum + l.rolls, 0);
    let grams = 0;
    const money = new Map<Currency, number>();
    for (const l of cart) {
      try {
        grams += multiply(toMicro(l.originalQuantity), toMicro(String(l.rolls)));
        if (isPositiveDecimal(l.price)) {
          money.set(
            l.currency,
            (money.get(l.currency) ?? 0) + multiply(toMicro(l.price), toMicro(String(l.rolls))),
          );
        }
      } catch {
        // Unparsable values were rejected when the line was added.
      }
    }
    return {
      rolls,
      grams,
      money: [...money].map(([c, amount]) => formatMoney({ amount, currency: c })),
    };
  })();

  const save = async () => {
    setError(null);
    if (missingPrice.length > 0) {
      setError(
        `${missingPrice.length} ${missingPrice.length === 1 ? 'line has' : 'lines have'} no price. Select them and set the price.`,
      );
      setSelected(new Set(missingPrice.map((l) => l.id)));
      return;
    }
    const d = details.getValues();
    const payload = {
      purchasedAt: orNull(d.purchasedAt),
      store: d.store,
      lines: cart.map((l) => linePayload(l, true)),
      expense:
        canManageFinance && d.recordExpense
          ? {
              categoryId: d.expenseCategoryId,
              paidAt: d.paymentState === 'paid' ? d.paidAt : null,
              method: d.method,
            }
          : null,
    };
    const check = purchaseSchema.safeParse(payload);
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? 'Check the purchase');
      return;
    }
    setSaving(true);
    try {
      const items = await api.post<InventoryItemView[]>('/inventory/purchases', payload, {
        headers: idempotency.headers,
      });
      idempotency.renew();
      await refresh();
      toast.success(
        'Purchase saved',
        `${totals.rolls} rolls in ${items.length} ${items.length === 1 ? 'filament' : 'filaments'}`,
      );
      allowLeave();
      void navigate('/inventory');
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.details?.[0]?.message ?? e.message)
          : 'Could not reach the server.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
      {guard}
      {/* Roll set-up: sticky on wide screens, so the grid never pushes it out of reach. */}
      <div
        ref={editorRef}
        className="scroll-mt-5 lg:sticky lg:top-5 lg:max-h-[calc(100vh-40px)] lg:overflow-y-auto lg:rounded-[var(--radius-card)]"
      >
        <Panel
          title={editingId ? 'Edit this roll' : 'Set up a roll'}
          description={
            editingId
              ? 'Change anything, then press Update.'
              : 'Add it, then duplicate it and change the color.'
          }
          className={cn('p-5 md:p-6', editingId !== null && 'ring-2 ring-teal')}
        >
          <ItemFields form={editor} products={products} />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Weight per roll"
              required
              inputMode="decimal"
              mono
              suffix="g"
              error={editorErrors.lot?.originalQuantity?.message}
              {...editor.register('lot.originalQuantity')}
            />
            <TextField
              label="Rolls"
              required
              inputMode="numeric"
              mono
              error={editorErrors.rolls?.message}
              {...editor.register('rolls')}
            />
            <TextField
              label="Price per roll"
              required
              inputMode="decimal"
              mono
              error={editorErrors.lot?.price?.message}
              {...editor.register('lot.price')}
            />
            <SelectField label="Currency" {...editor.register('lot.currency')}>
              <option value="CAD">CAD</option>
              <option value="BRL">BRL</option>
            </SelectField>
            <div className="col-span-2">
              <RollWarningField form={editor} className="" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => void addToCart()}>
              {editingId ? 'Update' : 'Add to purchase'}
            </Button>
            {editingId && (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingId(null);
                  editor.reset(blankEditor());
                }}
              >
                Stop editing
              </Button>
            )}
          </div>
        </Panel>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <Panel
          title="In this purchase"
          description={
            cart.length
              ? `${totals.rolls} ${totals.rolls === 1 ? 'roll' : 'rolls'} · ${showGrams(totals.grams)}${totals.money.length ? ` · ${totals.money.join(' + ')}` : ''}`
              : undefined
          }
        >
          {cart.length === 0 ? (
            <EmptyState title="Nothing added yet">
              Set up the first roll on the left and add it. Then duplicate it and change the color
              for each one you bought.
            </EmptyState>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SelectAll
                  checked={allSelected}
                  indeterminate={selected.size > 0 && !allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(cart.map((l) => l.id)))
                  }
                />
                <span className="label-mono text-ink-muted" aria-live="polite">
                  {selected.size > 0
                    ? `${selected.size} selected`
                    : 'Select rolls to change several at once'}
                </span>
              </div>
              {selected.size > 0 && (
                <BulkBar
                  count={selected.size}
                  currency={currency}
                  onApply={(change) =>
                    setCart((all) =>
                      all.map((l) => (selected.has(l.id) ? applyBulk(l, change) : l)),
                    )
                  }
                  onRemove={() => remove([...selected])}
                  onClear={() => setSelected(new Set())}
                />
              )}
              <div className="@container">
                <ul className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @2xl:grid-cols-4">
                  {cart.map((line) => (
                    <RollCard
                      key={line.id}
                      line={line}
                      selected={selected.has(line.id)}
                      editing={editingId === line.id}
                      inStock={Boolean(existingMatch(existing, line.item))}
                      onToggle={() => toggle(line.id)}
                      onRolls={(delta) => changeRolls(line.id, delta)}
                      onColor={() => setRecoloring(line)}
                      onDuplicate={() => duplicate(line)}
                      onEdit={() => editLine(line)}
                      onRemove={() => remove([line.id])}
                    />
                  ))}
                </ul>
              </div>
            </>
          )}
        </Panel>

        <Panel title="About this purchase" description="Applies to every roll above.">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Bought on" type="date" {...details.register('purchasedAt')} />
            <TextField
              label="Store"
              placeholder="e.g. Bambu Lab store"
              {...details.register('store')}
            />
          </div>
          {canManageFinance && (
            <div className="flex flex-col gap-4 rounded-[var(--radius-tile)] bg-bench p-5">
              <SwitchField
                label="Record in Costs & Expenses"
                description={`One expense for the whole order${totals.money.length ? ` (${totals.money.join(' + ')})` : ''}, linked to every roll. Turn off only for stock you already had before PrintBI.`}
                checked={Boolean(detailValues.recordExpense)}
                onCheckedChange={(checked) =>
                  details.setValue('recordExpense', checked, { shouldDirty: true })
                }
              />
              {detailValues.recordExpense && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField label="Expense category" {...details.register('expenseCategoryId')}>
                    {categories
                      .filter((c) => !c.archived)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </SelectField>
                  <SelectField label="Payment" {...details.register('paymentState')}>
                    <option value="paid">Already paid</option>
                    <option value="pending">Still to pay</option>
                  </SelectField>
                  {detailValues.paymentState === 'paid' && (
                    <>
                      <TextField label="Paid on" type="date" {...details.register('paidAt')} />
                      <SelectField label="Method" {...details.register('method')}>
                        <option value="credit">Credit card</option>
                        <option value="debit">Debit card</option>
                        <option value="cash">Cash</option>
                        <option value="transfer">Transfer</option>
                        <option value="other">Other</option>
                      </SelectField>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </Panel>

        {error && (
          <Notice tone="attention" title="Not saved">
            {error}
          </Notice>
        )}
        <div className="flex flex-wrap gap-3">
          <Button loading={saving} disabled={cart.length === 0} onClick={() => void save()}>
            {cart.length
              ? `Save all (${totals.rolls} ${totals.rolls === 1 ? 'roll' : 'rolls'})`
              : 'Save all'}
          </Button>
          <Button variant="ghost" onClick={() => void navigate('/inventory')}>
            Cancel
          </Button>
        </div>
      </div>

      {recoloring && (
        <RecolorDialog
          line={recoloring}
          onClose={() => setRecoloring(null)}
          onPick={(color) => {
            recolor(recoloring.id, color);
            setRecoloring(null);
          }}
        />
      )}
    </div>
  );
}

function SelectAll({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="flex cursor-pointer items-center gap-2.5 font-semibold">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-5 accent-teal"
      />
      Select all
    </label>
  );
}

interface RollCardProps {
  line: CartLine;
  selected: boolean;
  editing: boolean;
  inStock: boolean;
  onToggle: () => void;
  onRolls: (delta: number) => void;
  onColor: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

/** A roll as a product card: the spool in its own color on top, the details below. */
function RollCard({
  line,
  selected,
  editing,
  inStock,
  onToggle,
  onRolls,
  onColor,
  onDuplicate,
  onEdit,
  onRemove,
}: RollCardProps) {
  const name = lineName(line);
  const stops = filamentStops({
    colorKey: line.item.colorKey || null,
    colorHex: line.item.colorHex || null,
  });
  const priced = isPositiveDecimal(line.price);
  const iconButton =
    'grid size-9 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-ink';
  return (
    <li
      className={cn(
        'relative flex flex-col items-center gap-2 rounded-[var(--radius-tile)] border-2 bg-bench px-3 pt-4 pb-3 text-center transition-colors',
        selected ? 'border-teal bg-teal-soft/50' : 'border-transparent',
        editing && 'ring-2 ring-teal ring-offset-2',
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={`Select ${name}`}
        className="absolute top-3 left-3 size-5 cursor-pointer accent-teal"
      />
      <button
        type="button"
        onClick={onColor}
        aria-label={`Change the color of ${name}`}
        className="rounded-full p-1 hover:bg-surface"
      >
        <SpoolGauge
          remaining={1}
          capacity={1}
          color={stops}
          size={92}
          spinning={false}
          label={`${line.item.colorName || 'No color'} spool`}
        />
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="line-clamp-2 min-h-[2.6em] text-[15px] leading-tight font-bold hover:text-teal"
      >
        {name}
      </button>
      <span className="figure text-[12px] text-ink-muted">
        {line.originalQuantity} g{priced && ` · ${line.currency} ${line.price}`}
      </span>
      <span className="flex min-h-7 flex-wrap justify-center gap-1">
        {!priced && <Badge tone="hot">No price</Badge>}
        {inStock && <Badge tone="teal">Adds to stock</Badge>}
      </span>
      <div className="flex items-center gap-1" role="group" aria-label={`Rolls of ${name}`}>
        <button
          type="button"
          aria-label="One roll less"
          disabled={line.rolls <= 1}
          onClick={() => onRolls(-1)}
          className={cn(iconButton, 'disabled:opacity-40')}
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <span className="figure w-9 text-[17px] font-medium" aria-live="polite">
          {line.rolls}×
        </span>
        <button
          type="button"
          aria-label="One roll more"
          disabled={line.rolls >= 50}
          onClick={() => onRolls(1)}
          className={cn(iconButton, 'disabled:opacity-40')}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-center gap-0.5 border-t border-rule-soft pt-2">
        <button
          type="button"
          aria-label={`Change the color of ${name}`}
          title="Color"
          onClick={onColor}
          className={iconButton}
        >
          <Palette size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Duplicate ${name}`}
          title="Duplicate"
          onClick={onDuplicate}
          className={iconButton}
        >
          <Copy size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Edit ${name}`}
          title="Edit"
          onClick={onEdit}
          className={iconButton}
        >
          <Pencil size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Remove ${name}`}
          title="Remove"
          onClick={onRemove}
          className={iconButton}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

interface BulkBarProps {
  count: number;
  currency: Currency;
  onApply: (change: BulkChange) => void;
  onRemove: () => void;
  onClear: () => void;
}

/** Changes the selected rolls together; only the fields filled in are applied. */
function BulkBar({ count, currency, onApply, onRemove, onClear }: BulkBarProps) {
  const empty: BulkChange = {
    price: '',
    currency,
    originalQuantity: '',
    rolls: '',
    lowStockThreshold: '',
  };
  const [change, setChange] = useState<BulkChange>(empty);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<BulkChange>) => setChange((c) => ({ ...c, ...patch }));

  const apply = () => {
    const filled = [
      change.price,
      change.originalQuantity,
      change.rolls,
      change.lowStockThreshold,
    ].some((v) => v.trim());
    if (!filled) return setProblem('Fill at least one field to apply.');
    if (change.price.trim() && !isPositiveDecimal(change.price))
      return setProblem('Enter a valid price.');
    if (change.originalQuantity.trim() && !isPositiveDecimal(change.originalQuantity))
      return setProblem('Enter a valid weight.');
    const rolls = Number(change.rolls);
    if (change.rolls.trim() && !(Number.isInteger(rolls) && rolls >= 1 && rolls <= 50))
      return setProblem('Rolls must be 1 to 50.');
    setProblem(null);
    onApply(change);
    setChange(empty);
  };

  return (
    <section
      aria-label={`Change ${count} selected rolls`}
      className="flex flex-col gap-3 rounded-[var(--radius-tile)] border-2 border-teal bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <strong>Apply to {count} selected</strong>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear the selection"
          className="grid size-9 place-items-center rounded-full text-ink-muted hover:bg-bench"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_96px_1fr_1fr_1fr]">
        <TextField
          label="Price per roll"
          inputMode="decimal"
          mono
          value={change.price}
          onChange={(e) => set({ price: e.target.value })}
        />
        <SelectField
          label="Currency"
          value={change.currency}
          onChange={(e) => set({ currency: e.target.value as Currency })}
        >
          <option value="CAD">CAD</option>
          <option value="BRL">BRL</option>
        </SelectField>
        <TextField
          label="Weight"
          inputMode="decimal"
          mono
          suffix="g"
          value={change.originalQuantity}
          onChange={(e) => set({ originalQuantity: e.target.value })}
        />
        <TextField
          label="Rolls each"
          inputMode="numeric"
          mono
          value={change.rolls}
          onChange={(e) => set({ rolls: e.target.value })}
        />
        <TextField
          label="Warn below"
          inputMode="decimal"
          mono
          suffix="g"
          value={change.lowStockThreshold}
          onChange={(e) => set({ lowStockThreshold: e.target.value })}
        />
      </div>
      {problem && (
        <p role="alert" className="text-[13px] font-semibold text-hot-ink">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={apply}>
          Apply to selected
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 size={15} aria-hidden="true" />}
          onClick={onRemove}
        >
          Remove selected
        </Button>
      </div>
    </section>
  );
}

interface RecolorDialogProps {
  line: CartLine;
  onPick: (color: ColorValue) => void;
  onClose: () => void;
}

/** Picks a new color for one roll, without leaving the grid. */
function RecolorDialog({ line, onPick, onClose }: RecolorDialogProps) {
  const [color, setColor] = useState<ColorValue>({
    colorKey: line.item.colorKey,
    colorName: line.item.colorName,
    colorHex: line.item.colorHex,
  });
  const chosen = Boolean(color.colorName.trim() && (color.colorKey || color.colorHex));
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Choose the color"
      description={`${line.rolls} ${line.rolls === 1 ? 'roll' : 'rolls'} of ${line.item.brand} ${line.item.productName || line.item.materialType}`.replace(
        /\s+/g,
        ' ',
      )}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!chosen} onClick={() => onPick(color)}>
            Use this color
          </Button>
        </>
      }
    >
      <ColorPicker value={color} onChange={setColor} />
    </Modal>
  );
}
