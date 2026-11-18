import type {
  CategoryView,
  Currency,
  FilamentProductView,
  InventoryItemView,
  ItemKind,
  PaymentMethod,
  Unit,
} from '@printbi/shared';

export interface ItemForm {
  kind: ItemKind;
  name: string;
  lowStockThreshold: string;
  notes: string;
  // Filament
  productId: string;
  materialType: string;
  brand: string;
  colorKey: string;
  colorName: string;
  colorHex: string;
  diameterMm: string;
  densityGcm3: string;
  nozzleTempMin: string;
  nozzleTempMax: string;
  bedTempMin: string;
  bedTempMax: string;
  // Other consumables
  category: string;
  description: string;
  unit: Unit;
  customUnit: string;
}

export interface LotForm {
  label: string;
  originalQuantity: string;
  partlyUsed: boolean;
  remaining: string;
  price: string;
  currency: Currency;
  purchasedAt: string;
  store: string;
  notes: string;
  recordExpense: boolean;
  expenseCategoryId: string;
  paymentState: 'paid' | 'pending';
  paidAt: string;
  method: PaymentMethod;
}

export const today = () => new Date().toISOString().slice(0, 10);

export const emptyItem = (kind: ItemKind = 'filament'): ItemForm => ({
  kind,
  name: '',
  lowStockThreshold: kind === 'filament' ? '100' : '',
  notes: '',
  productId: '',
  materialType: 'PLA',
  brand: '',
  colorKey: '',
  colorName: '',
  colorHex: '',
  diameterMm: '1.75',
  densityGcm3: '',
  nozzleTempMin: '',
  nozzleTempMax: '',
  bedTempMin: '',
  bedTempMax: '',
  category: kind === 'packaging' ? 'Packaging' : 'Fasteners',
  description: '',
  unit: 'unit',
  customUnit: '',
});

export const emptyLot = (currency: Currency, expenseCategoryId = ''): LotForm => ({
  label: '',
  originalQuantity: '1000',
  partlyUsed: false,
  remaining: '',
  price: '',
  currency,
  purchasedAt: today(),
  store: '',
  notes: '',
  recordExpense: false,
  expenseCategoryId,
  paymentState: 'paid',
  paidAt: today(),
  method: 'credit',
});

const micro = (value: number | null) => (value === null ? '' : String(value / 1_000_000));
const num = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(value);

export function itemToForm(item: InventoryItemView): ItemForm {
  const f = item.filament;
  return {
    ...emptyItem(item.kind),
    name: item.name,
    lowStockThreshold: micro(item.lowStockThreshold),
    notes: item.notes,
    productId: f?.productId ?? '',
    materialType: f?.materialType ?? 'PLA',
    brand: f?.brand ?? '',
    colorKey: f?.colorKey ?? '',
    colorName: f?.colorName ?? '',
    colorHex: f?.colorHex ?? '',
    diameterMm: num(f?.diameterMm ?? 1.75),
    densityGcm3: num(f?.densityGcm3),
    nozzleTempMin: num(f?.nozzleTempMin),
    nozzleTempMax: num(f?.nozzleTempMax),
    bedTempMin: num(f?.bedTempMin),
    bedTempMax: num(f?.bedTempMax),
    category: item.category || 'Fasteners',
    description: item.description,
    unit: item.unit === 'g' && item.kind !== 'filament' ? 'g' : item.unit,
    customUnit: item.customUnit,
  };
}

/** Product picked from the catalog: fill everything it knows, keep what it does not. */
export function applyProduct(form: ItemForm, p: FilamentProductView): Partial<ItemForm> {
  return {
    productId: p.id,
    brand: p.brand,
    materialType: p.type,
    diameterMm: num(p.diameterMm ?? Number(form.diameterMm || 1.75)),
    densityGcm3: num(p.densityGcm3),
    nozzleTempMin: num(p.nozzleTempMin),
    nozzleTempMax: num(p.nozzleTempMax),
    bedTempMin: num(p.bedTempMin),
    bedTempMax: num(p.bedTempMax),
  };
}

/** "Bambu Lab PLA Black": the name proposed while the user has not typed their own. */
export const suggestedName = (f: ItemForm) =>
  [f.brand, f.materialType, f.colorName].filter((part) => part.trim()).join(' ');

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

export function toItemPayload(f: ItemForm) {
  const base = { name: f.name, lowStockThreshold: orNull(f.lowStockThreshold), notes: f.notes };
  if (f.kind === 'filament') {
    return {
      kind: 'filament' as const,
      ...base,
      filament: {
        productId: orNull(f.productId),
        materialType: f.materialType,
        brand: f.brand,
        colorKey: orNull(f.colorKey),
        colorName: f.colorName,
        colorHex: f.colorKey ? null : orNull(f.colorHex),
        diameterMm: f.diameterMm || '1.75',
        densityGcm3: orNull(f.densityGcm3),
        nozzleTempMin: orNull(f.nozzleTempMin),
        nozzleTempMax: orNull(f.nozzleTempMax),
        bedTempMin: orNull(f.bedTempMin),
        bedTempMax: orNull(f.bedTempMax),
      },
    };
  }
  return {
    kind: f.kind,
    ...base,
    category: f.category,
    description: f.description,
    unit: f.unit,
    customUnit: f.customUnit,
  };
}

export function toLotPayload(
  l: LotForm,
  { withCosts, withExpense }: { withCosts: boolean; withExpense: boolean },
) {
  const price = withCosts ? orNull(l.price) : null;
  return {
    label: l.label,
    originalQuantity: l.originalQuantity,
    remaining: l.partlyUsed ? l.remaining : l.originalQuantity,
    totalCost: price ? { amount: price, currency: l.currency } : null,
    purchasedAt: orNull(l.purchasedAt),
    store: l.store,
    notes: l.notes,
    expense:
      withExpense && l.recordExpense
        ? {
            categoryId: l.expenseCategoryId,
            paidAt: l.paymentState === 'paid' ? l.paidAt : null,
            method: l.method,
          }
        : null,
  };
}

/** Payload paths (schema or server) → the form field that shows the message. */
export function formPath(path: string, lotPrefix = 'firstLot'): string {
  return path
    .replace(/^item\.filament\./, 'item.')
    .replace(new RegExp(`^${lotPrefix}\\.`), 'lot.')
    .replace(/^lot\.totalCost(\.amount)?$/, 'lot.price')
    .replace(/^lot\.expense\.categoryId$/, 'lot.expenseCategoryId')
    .replace(/^lot\.expense\.paidAt$/, 'lot.paidAt');
}

/** The expense category a purchase of this kind usually belongs to. */
export function defaultExpenseCategory(categories: CategoryView[], kind: ItemKind): string {
  const wanted =
    kind === 'filament' ? 'Filament' : kind === 'packaging' ? 'Packaging' : 'Materials';
  const active = categories.filter((c) => !c.archived);
  return (active.find((c) => c.name === wanted) ?? active[0])?.id ?? '';
}
