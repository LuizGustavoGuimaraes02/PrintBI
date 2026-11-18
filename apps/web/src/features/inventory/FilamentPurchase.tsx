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
import { Copy, Minus, Palette, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import {
  Button,
  ColorSwatch,
  EmptyState,
  Modal,
  Notice,
  Panel,
  SelectField,
  SwitchField,
  TextField,
  useToast,
} from '../../design-system';
import { filamentFinish, filamentStops } from '../../design-system/ColorSwatch';
import { api, ApiError } from '../../lib/api';
import { showGrams } from '../../lib/quantity';
import { useIdempotencyKey } from '../../lib/useIdempotencyKey';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { useCan } from '../auth/account';
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
import { ColorPicker, type ColorValue } from './ColorPicker';
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

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

export function linePayload(line: CartLine, withCosts: boolean) {
  const price = withCosts ? orNull(line.price) : null;
  return {
    item: toItemPayload({ ...line.item, name: line.item.name.trim() || suggestedName(line.item) }),
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
 * Registering a whole order: set up one roll, add it to the purchase, then duplicate it and
 * change only the color (or anything else). Everything is saved together, with one expense.
 */
export function FilamentPurchase({ currency, categories, products }: FilamentPurchaseProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const refresh = useRefreshInventory();
  const canSeeFinance = useCan('finance:view');
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
      recordExpense: false,
      expenseCategoryId: defaultExpenseCategory(categories, 'filament'),
      paymentState: 'paid',
      paidAt: today(),
      method: 'credit',
    },
  });
  const detailValues = useWatch({ control: details.control });
  const editorErrors = editor.formState.errors;

  const [cart, setCart] = useState<CartLine[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recoloring, setRecoloring] = useState<CartLine | null>(null);
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

  /** Adds (or updates) the line, then clears only the color so the next one is quick. */
  const addToCart = editor.handleSubmit((values) => {
    const line = toLine(values, editingId ?? nextId());
    const check = purchaseLineSchema.safeParse(linePayload(line, canSeeFinance));
    if (!check.success) {
      for (const issue of check.error.issues) {
        editor.setError(editorPath(issue.path.map(String).join('.')) as never, {
          message: issue.message,
        });
      }
      return;
    }
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

  /** Brings the editor into view (it sits above the list) and focuses its first field. */
  const showEditor = () =>
    requestAnimationFrame(() => {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      editorRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      editorRef.current
        ?.querySelector<HTMLElement>('input, select, textarea')
        ?.focus({ preventScroll: true });
    });

  const editLine = (line: CartLine) => {
    setEditingId(line.id);
    loadIntoEditor(line);
    showEditor();
  };

  /** The usual next step after buying several colors: copy the line and pick another color. */
  const duplicate = (line: CartLine) => {
    const copy = { ...line, id: nextId(), item: { ...line.item } };
    setCart((all) => {
      const index = all.findIndex((l) => l.id === line.id);
      return [...all.slice(0, index + 1), copy, ...all.slice(index + 1)];
    });
    setRecoloring(copy);
  };

  /** New color for one line; an automatic name follows the color, a typed one is kept. */
  const recolor = (
    lineId: number,
    color: { colorKey: string; colorName: string; colorHex: string },
  ) =>
    setCart((all) =>
      all.map((l) => {
        if (l.id !== lineId) return l;
        const automatic = !l.item.name.trim() || l.item.name.trim() === suggestedName(l.item);
        return { ...l, item: { ...l.item, ...color, name: automatic ? '' : l.item.name } };
      }),
    );

  const changeRolls = (id: number, delta: number) =>
    setCart((all) =>
      all.map((l) =>
        l.id === id ? { ...l, rolls: Math.min(50, Math.max(1, l.rolls + delta)) } : l,
      ),
    );

  const totals = (() => {
    const rolls = cart.reduce((sum, l) => sum + l.rolls, 0);
    let grams = 0;
    const money = new Map<Currency, number>();
    for (const l of cart) {
      try {
        grams += multiply(toMicro(l.originalQuantity), toMicro(String(l.rolls)));
        if (canSeeFinance && l.price.trim()) {
          money.set(
            l.currency,
            (money.get(l.currency) ?? 0) + multiply(toMicro(l.price), toMicro(String(l.rolls))),
          );
        }
      } catch {
        // An unparsable line was rejected when added; ignore it in the preview.
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
    const d = details.getValues();
    const withExpense = canManageFinance && d.recordExpense;
    const payload = {
      purchasedAt: orNull(d.purchasedAt),
      store: d.store,
      lines: cart.map((l) => linePayload(l, canSeeFinance)),
      expense: withExpense
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
    <>
      {guard}
      <div ref={editorRef} className="scroll-mt-5">
        <Panel
          title={editingId ? 'Edit this line' : 'Roll to add'}
          description={
            editingId
              ? 'Change anything here, then press Update line.'
              : 'Set up one roll, add it to the purchase, then change only the color for the next.'
          }
          className={editingId ? 'ring-2 ring-teal' : undefined}
        >
          <ItemFields form={editor} products={products} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <TextField
              label="Net weight per roll"
              required
              inputMode="decimal"
              mono
              suffix="g"
              error={editorErrors.lot?.originalQuantity?.message}
              {...editor.register('lot.originalQuantity')}
            />
            {canSeeFinance && (
              <div className="grid grid-cols-[1fr_96px] gap-3">
                <TextField
                  label="Price per roll"
                  inputMode="decimal"
                  mono
                  error={editorErrors.lot?.price?.message}
                  {...editor.register('lot.price')}
                />
                <SelectField label="Currency" {...editor.register('lot.currency')}>
                  <option value="CAD">CAD</option>
                  <option value="BRL">BRL</option>
                </SelectField>
              </div>
            )}
            <TextField
              label="Rolls of this color"
              inputMode="numeric"
              mono
              error={editorErrors.rolls?.message}
              {...editor.register('rolls')}
            />
            <RollWarningField form={editor} className="" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => void addToCart()}>
              {editingId ? 'Update line' : 'Add to purchase'}
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
            Add the first roll above. Then duplicate it and change the color for each one you
            bought.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-rule-soft">
            {cart.map((line) => {
              const name = line.item.name.trim() || suggestedName(line.item);
              const match = existingMatch(existing, line.item);
              const stops = filamentStops({
                colorKey: line.item.colorKey || null,
                colorHex: line.item.colorHex || null,
              });
              return (
                <li
                  key={line.id}
                  className={`flex flex-wrap items-center gap-4 py-3 ${editingId === line.id ? 'rounded-[var(--radius-tile)] bg-teal-soft/40 px-3' : ''}`}
                >
                  <button
                    type="button"
                    aria-label={`Change the color of ${name}`}
                    onClick={() => setRecoloring(line)}
                    className="rounded-full p-1 hover:bg-bench"
                  >
                    <ColorSwatch
                      stops={stops}
                      finish={filamentFinish({ colorKey: line.item.colorKey || null })}
                      size={32}
                    />
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <strong>{name}</strong>
                    <span className="figure text-[13px] text-ink-muted">
                      {line.originalQuantity} g each
                      {canSeeFinance && line.price && ` · ${line.currency} ${line.price} each`}
                      {line.lowStockThreshold && ` · warns below ${line.lowStockThreshold} g`}
                    </span>
                    {match && (
                      <span className="text-[13px] text-teal-ink">
                        Adds to {match.name} already in stock
                      </span>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-1"
                    role="group"
                    aria-label={`Rolls of ${name}`}
                  >
                    <button
                      type="button"
                      aria-label="One roll less"
                      disabled={line.rolls <= 1}
                      onClick={() => changeRolls(line.id, -1)}
                      className="grid size-10 place-items-center rounded-full hover:bg-bench disabled:opacity-40"
                    >
                      <Minus size={16} aria-hidden="true" />
                    </button>
                    <span
                      className="figure w-10 text-center text-[17px] font-medium"
                      aria-live="polite"
                    >
                      {line.rolls}×
                    </span>
                    <button
                      type="button"
                      aria-label="One roll more"
                      disabled={line.rolls >= 50}
                      onClick={() => changeRolls(line.id, 1)}
                      className="grid size-10 place-items-center rounded-full hover:bg-bench disabled:opacity-40"
                    >
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="soft"
                      icon={<Palette size={15} aria-hidden="true" />}
                      onClick={() => setRecoloring(line)}
                    >
                      Color
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      icon={<Copy size={15} aria-hidden="true" />}
                      onClick={() => duplicate(line)}
                    >
                      Duplicate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Pencil size={15} aria-hidden="true" />}
                      onClick={() => editLine(line)}
                    >
                      Edit
                    </Button>
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() => {
                        setCart((all) => all.filter((l) => l.id !== line.id));
                        if (editingId === line.id) setEditingId(null);
                      }}
                      className="grid size-10 place-items-center rounded-full text-ink-muted hover:bg-bench hover:text-ink"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
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
              label="Also record the purchase as one expense"
              description={`One expense for the whole order${totals.money.length ? ` (${totals.money.join(' + ')})` : ''}, linked to every roll.`}
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
    </>
  );
}

interface RecolorDialogProps {
  line: CartLine;
  onPick: (color: ColorValue) => void;
  onClose: () => void;
}

/** Picks a new color for one line of the purchase, without leaving the list. */
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
      description={`${line.rolls} ${line.rolls === 1 ? 'roll' : 'rolls'} of ${line.item.brand || ''} ${line.item.productName || line.item.materialType}`.replace(
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
