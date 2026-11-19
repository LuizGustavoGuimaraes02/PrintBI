import {
  formatMoney,
  parseDecimal,
  type Currency,
  type ProductType,
  type ProductView,
  type SaleUnit,
} from '@printbi/shared';
import { toField } from '../../lib/money';

export interface ProductForm {
  type: ProductType;
  name: string;
  description: string;
  labelIds: string[];
  currency: Currency;
  price: string;
  estimatedCost: string;
  saleUnit: SaleUnit;
  customUnit: string;
  widthMm: string;
  depthMm: string;
  heightMm: string;
  filamentGrams: string;
  notes: string;
}

export const emptyProduct = (currency: Currency): ProductForm => ({
  type: 'product',
  name: '',
  description: '',
  labelIds: [],
  currency,
  price: '',
  estimatedCost: '',
  saleUnit: 'unit',
  customUnit: '',
  widthMm: '',
  depthMm: '',
  heightMm: '',
  filamentGrams: '',
  notes: '',
});

const dimension = (n: number | null) => (n === null ? '' : String(n));

export function productToForm(p: ProductView, fallback: Currency): ProductForm {
  return {
    type: p.type,
    name: p.name,
    description: p.description,
    labelIds: p.labels.map((l) => l.id),
    currency: p.price?.currency ?? p.estimatedCost?.currency ?? fallback,
    price: toField(p.price?.amount),
    estimatedCost: toField(p.estimatedCost?.amount),
    saleUnit: p.saleUnit,
    customUnit: p.customUnit,
    widthMm: dimension(p.specs.widthMm),
    depthMm: dimension(p.specs.depthMm),
    heightMm: dimension(p.specs.heightMm),
    filamentGrams: toField(p.specs.filamentGrams),
    notes: p.notes,
  };
}

const optionalNumber = (value: string) => (value.trim() === '' ? null : Number(value));
const optionalMoney = (amount: string, currency: Currency) =>
  amount.trim() === '' ? null : { amount: amount.trim(), currency };

/** Services have no physical size, so their size fields are cleared on save. */
export function productPayload(v: ProductForm, canSeeCost: boolean) {
  const physical = v.type === 'product';
  return {
    type: v.type,
    name: v.name,
    description: v.description,
    labelIds: v.labelIds,
    price: optionalMoney(v.price, v.currency),
    estimatedCost: canSeeCost ? optionalMoney(v.estimatedCost, v.currency) : null,
    saleUnit: v.saleUnit,
    customUnit: v.saleUnit === 'custom' ? v.customUnit : '',
    specs: {
      widthMm: physical ? optionalNumber(v.widthMm) : null,
      depthMm: physical ? optionalNumber(v.depthMm) : null,
      heightMm: physical ? optionalNumber(v.heightMm) : null,
      filamentGrams: physical && v.filamentGrams.trim() ? v.filamentGrams.trim() : null,
    },
    notes: v.notes,
  };
}

/** API paths such as `price.amount` or `specs.widthMm` back to the form field. */
export const productFormPath = (path: string) =>
  path.replace(/^specs\./, '').replace(/\.(amount|currency)$/, '');

/**
 * Margin of the price over the estimated cost, as words for the form, or null when
 * either is missing. Decimals are parsed exactly, never with floating point.
 */
export function marginNote(price: string, cost: string): string | null {
  try {
    const p = BigInt(parseDecimal(price));
    const c = BigInt(parseDecimal(cost));
    if (p <= 0n || c < 0n) return null;
    if (p < c) return 'The price is below the estimated cost.';
    const percent = Number(((p - c) * 1000n) / p) / 10;
    return `Margin ${percent.toFixed(1).replace(/\.0$/, '')}% of the price.`;
  } catch {
    return null;
  }
}

export const UNIT_LABEL: Record<SaleUnit, string> = {
  unit: 'piece',
  hour: 'hour',
  service: 'job',
  custom: '',
};

export function priceText(p: Pick<ProductView, 'price' | 'saleUnit' | 'customUnit'>): string {
  if (!p.price) return 'No set price';
  const unit = p.saleUnit === 'custom' ? p.customUnit : UNIT_LABEL[p.saleUnit];
  return `${formatMoney(p.price)}${unit ? ` / ${unit}` : ''}`;
}

export function specsText(specs: ProductView['specs']): string {
  const { widthMm, depthMm, heightMm, filamentGrams } = specs;
  const size = [widthMm, depthMm, heightMm].every((n) => n !== null)
    ? `${widthMm} × ${depthMm} × ${heightMm} mm`
    : '';
  const grams = filamentGrams !== null ? `${toField(filamentGrams)} g of filament` : '';
  return [size, grams].filter(Boolean).join(' · ');
}
