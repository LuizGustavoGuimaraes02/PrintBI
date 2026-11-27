/**
 * Response shapes of the API, shared with the web app. Dates are ISO strings;
 * money is `{ amount, currency }` with `amount` in integer micro-units.
 */
import type { Currency, Money } from './money';
import type { PaymentMethod } from './schemas/inventory';
import type { Permission, Role } from './permissions';
import type { CalcResult } from './calculator';
import type { CalcInput } from './schemas/calculator';
import type { BreakdownRow } from './quotes';
import type { StaleReminder } from './orders';
import type { SaleProfit } from './sales';
import type {
  SaleCustomerKind,
  SalePayment,
  SaleProduction,
  SaleProductionView,
} from './schemas/sale';
import type {
  BlockReason,
  LegacyStatus,
  OrderPriority,
  OrderStatus,
  OrderType,
  PaymentStatus,
  RecipientKind,
} from './schemas/order';

export interface AccountView {
  user: { id: string; firstName: string; lastName: string; email: string };
  companies: { id: string; name: string; role: Role }[];
  activeCompany: {
    id: string;
    name: string;
    role: Role;
    finance: boolean;
    permissions: Permission[];
  } | null;
}

export interface CompanyView {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  social: string;
  logo: ImageView | null;
}

export interface MemberView {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  finance: boolean;
  joinedAt: string | null;
}

export interface InviteView {
  id: string;
  email: string;
  role: Role;
  finance: boolean;
  createdAt: string;
  expiresAt: string;
}

export type InviteStatus = 'valid' | 'expired' | 'used' | 'revoked';

export interface InvitePreview {
  companyName: string;
  email: string;
  role: Role;
  status: InviteStatus;
}

export interface CompanySettingsView {
  currency: {
    defaultCurrency: Money['currency'];
    brlPerCad: number | null;
    rateUpdatedAt: string | null;
  };
  calculator: {
    energyPricePerKwh: Money;
    laborRatePerHour: Money;
    targetMarginPercent: number | null;
    riskPercent: number;
    riskBase: 'filament' | 'materials' | 'total';
    quoteValidityDays: number;
    paymentTerms: string;
    /** When the defaults were last saved; null while never reviewed. */
    reviewedAt: string | null;
  };
  reminders: {
    enabled: boolean;
    quoteWaitingDays: number;
    approvedNotStartedDays: number;
    inProgressDays: number;
    blockedDays: number;
    printedDays: number;
  };
  board: { completedRetentionDays: number };
  inventory: { rollLowStockThreshold: number };
}

export type PrinterRecoveryView = {
  years: number;
  hoursPerDay: number;
  daysPerYear: number;
  maintenance: { kind: 'amount'; amount: number } | { kind: 'percent'; percent: number };
};

export interface PrinterView {
  id: string;
  /** Catalog model linked to this printer, for its spec sheet. */
  modelId: string | null;
  name: string;
  brand: string;
  model: string;
  purchasedAt: string | null;
  powerWatts: number | null;
  status: 'active' | 'maintenance' | 'retired';
  notes: string;
  /** Financial fields: null unless the viewer has `finance:view`. */
  purchaseCost: Money | null;
  costPerHour: Money | null;
  recovery: PrinterRecoveryView | null;
}

export interface CategoryView {
  id: string;
  name: string;
  archived: boolean;
}

export interface ApiErrorBody {
  message: string;
  code: string;
  details?: { path: string; message: string }[];
}

/**
 * A printer model from the bundled FDM catalog (Open 3D Printer Database, CC BY 4.0).
 * Fields are null when the source has no value for them.
 */
export interface PrinterModelView {
  id: string;
  brand: string;
  model: string;
  fullName: string;
  buildVolumeMm: { x: number; y: number; z: number } | null;
  buildVolumeCm3: number | null;
  nozzleDiameterMm: number | null;
  maxSpeedMmS: number | null;
  /** Rated (peak) power from the spec sheet, not the average draw while printing. */
  ratedPowerW: number | null;
  heaterPowerW: number | null;
  typicalNozzleTempC: number | null;
  typicalBedTempC: number | null;
  /** Reference retail price in whole euros. */
  typicalPriceEur: number | null;
  maintenanceEurPerYear: number | null;
}

export const PRINTER_CATALOG_ATTRIBUTION = {
  name: 'Open 3D Printer Database',
  url: 'https://github.com/swordlab/open-3d-printer-database',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  note: 'FDM printers only; brand names normalized and fields selected for PrintBI.',
} as const;

export interface FilamentSpecView {
  productId: string | null;
  materialType: string;
  brand: string;
  colorKey: string | null;
  colorName: string;
  colorHex: string | null;
  diameterMm: number;
  densityGcm3: number | null;
  nozzleTempMin: number | null;
  nozzleTempMax: number | null;
  bedTempMin: number | null;
  bedTempMax: number | null;
}

export interface InventoryLotView {
  id: string;
  label: string;
  /** Quantities in micro-units of the item's unit (grams for filament). */
  originalQuantity: number;
  remaining: number;
  status: 'sealed' | 'in_use' | 'empty' | 'archived';
  purchasedAt: string | null;
  openedAt: string | null;
  store: string;
  notes: string;
  /** Financial fields: null without `finance:view` (or when the cost is unknown). */
  totalCost: Money | null;
  /** Cost of one unit (one gram for filament), in micro-units of money. */
  unitCost: Money | null;
  expenseId: string | null;
  /** True once anything was taken from it: its cost can no longer be edited. */
  used: boolean;
  /** This roll's own warning limit, or null when it follows the company default. */
  lowStockThreshold: number | null;
  /** The limit in force (own or default); null for non-filament lots. */
  effectiveLowStockThreshold: number | null;
  low: boolean;
}

export interface InventoryItemView {
  id: string;
  kind: 'filament' | 'material' | 'packaging' | 'other';
  name: string;
  unit: 'g' | 'unit' | 'm' | 'ml' | 'custom';
  customUnit: string;
  category: string;
  description: string;
  filament: FilamentSpecView | null;
  lowStockThreshold: number | null;
  notes: string;
  archived: boolean;
  /** Totals over lots that are not archived. */
  remaining: number;
  activeLots: number;
  /** Filament: rolls at or below their warning limit. */
  lowLots: number;
  low: boolean;
  out: boolean;
  /** Stock value per currency (never summed across currencies); null without `finance:view`. */
  value: Money[] | null;
  lots: InventoryLotView[];
  updatedAt: string;
}

export interface InventorySummaryView {
  filamentItems: number;
  filamentGrams: number;
  lowStockItems: number;
  outOfStockItems: number;
  value: Money[] | null;
}

export interface StockMovementView {
  id: string;
  itemId: string;
  lotId: string;
  lotLabel: string;
  type: 'purchase' | 'consumption' | 'loss' | 'adjustment' | 'return' | 'correction';
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  unitCost: Money | null;
  reason: string;
  reversalOf: string | null;
  reversed: boolean;
  actorName: string;
  orderId: string | null;
  saleId: string | null;
  createdAt: string;
}

export interface FilamentProductView {
  id: string;
  brand: string;
  product: string;
  type: string;
  diameterMm: number | null;
  densityGcm3: number | null;
  nozzleTempMin: number | null;
  nozzleTempMax: number | null;
  bedTempMin: number | null;
  bedTempMax: number | null;
  /** Reference price per kg in whole euros. */
  priceEurPerKg: number | null;
}

export interface PaymentView {
  id: string;
  amount: number;
  paidAt: string;
  method: 'cash' | 'credit' | 'debit' | 'transfer' | 'other';
  note: string;
}

export interface ExpenseView {
  id: string;
  description: string;
  category: { id: string; name: string };
  amount: Money;
  /** Micro-units in the expense's currency. */
  paid: number;
  outstanding: number;
  status: 'pending' | 'partial' | 'paid' | 'cancelled';
  purchasedAt: string;
  vendor: string;
  dueDate: string | null;
  notes: string;
  payments: PaymentView[];
  /** Stock lots this expense paid for (one order can cover several rolls). */
  stock: { itemId: string; lotId: string; itemName: string; lotLabel: string }[];
  cancelled: { at: string; reason: string } | null;
  createdAt: string;
}

export interface ExpenseSummaryView {
  /** Purchases dated in the period, per currency (cancelled excluded). */
  recorded: Money[];
  /** Payments made in the period, per currency: actual cash out. */
  paid: Money[];
  /** Still owed on expenses of the period, per currency. */
  pending: Money[];
  topCategory: { name: string; amount: Money } | null;
}

export const FILAMENT_CATALOG_ATTRIBUTION = {
  name: 'Open 3D Printer Database',
  url: 'https://github.com/swordlab/open-3d-printer-database',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  note: 'FDM filaments only; material names normalized and fields selected for PrintBI.',
} as const;

export interface LabelView {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  /** Active products and services using it. */
  productCount: number;
}

export interface ProductView {
  id: string;
  type: 'product' | 'service';
  name: string;
  description: string;
  labels: { id: string; name: string; color: string }[];
  price: Money | null;
  /** Null without `finance:view`. */
  estimatedCost: Money | null;
  saleUnit: 'unit' | 'hour' | 'service' | 'custom';
  customUnit: string;
  specs: {
    widthMm: number | null;
    depthMm: number | null;
    heightMm: number | null;
    filamentGrams: number | null;
  };
  notes: string;
  /** Photos in display order; the first is the cover. */
  images: ImageView[];
  showcase: ProductShowcaseView;
  archived: boolean;
  /** Units sold so far; filled once sales exist. */
  soldQuantity: number;
  updatedAt: string;
}

export interface CustomerView {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  source: { id: string; name: string } | null;
  sourceDetail: string;
  archived: boolean;
  /** Filled once sales exist (Part 8). */
  salesCount: number;
  totalPurchased: Money[];
  createdAt: string;
}

/** A priced lot not linked to any expense yet. */
export interface UnrecordedLotView {
  itemId: string;
  lotId: string;
  itemName: string;
  kind: InventoryItemView['kind'];
  lotLabel: string;
  purchasedAt: string | null;
  store: string;
  totalCost: Money;
}

export interface CustomerSourceView {
  id: string;
  name: string;
  archived: boolean;
  /** Active customers who came from this source. */
  customerCount: number;
}

/** An uploaded image with ready-made sizes (Cloudinary picks the best format per browser). */
export interface ImageView {
  id: string;
  width: number;
  height: number;
  alt: string;
  urls: {
    /** Square crop, 400 px: lists and grids. */
    thumb: string;
    /** Square crop, 800 px: showcase cards. */
    card: string;
    /** Whole image, up to 1600 px: galleries. */
    full: string;
  };
}

export interface ProductShowcaseView {
  visible: boolean;
  badge: 'ready' | 'made_to_order';
  showPrice: boolean;
  featured: boolean;
  /** Position among visible products; lower comes first. */
  order: number;
  /** Part of the public product link; set the first time the product is shown. */
  slug: string | null;
  /** Seasonal collections it also appears in. */
  collections: ('valentines' | 'easter' | 'halloween' | 'christmas')[];
}

export interface UploadConfigView {
  /** False until Cloudinary credentials are configured on the API. */
  enabled: boolean;
}

/** Everything the browser sends to Cloudinary for one signed upload. */
export interface UploadSignatureView {
  uploadUrl: string;
  publicId: string;
  fields: Record<string, string>;
  maxBytes: number;
  formats: readonly string[];
}

export interface ShowcaseSettingsView {
  published: boolean;
  slug: string;
  title: string;
  description: string;
  language: 'en' | 'pt-BR';
  whatsapp: string;
  messageTemplate: string;
  /** Path of the public page, e.g. /s/layer-lab. */
  publicPath: string;
}

/** An image as the public showcase sees it: no internal id. */
export type PublicImageView = Omit<ImageView, 'id'>;

/** A label on the public showcase: customers filter by its name. */
export interface PublicLabelView {
  name: string;
  color: string;
}

export interface PublicBusinessView {
  name: string;
  slug: string;
  title: string;
  description: string;
  language: 'en' | 'pt-BR';
  whatsapp: string;
  messageTemplate: string;
  logo: PublicImageView | null;
  website: string;
  social: string;
}

/** Public showcase: only fields meant for customers, never costs, notes, sales data or ids. */
export interface PublicShowcaseView {
  business: PublicBusinessView;
  labels: PublicLabelView[];
  products: PublicProductCardView[];
  /** Active seasonal collections, shown as the banner (a carousel when there are several). */
  collections: PublicCollectionView[];
}

export interface PublicProductCardView {
  slug: string;
  type: 'product' | 'service';
  name: string;
  description: string;
  labels: PublicLabelView[];
  badge: 'ready' | 'made_to_order';
  featured: boolean;
  /** Present only when the business chose to show it. */
  price: Money | null;
  saleUnit: 'unit' | 'hour' | 'service' | 'custom';
  customUnit: string;
  specs: ProductView['specs'];
  cover: PublicImageView | null;
  imageCount: number;
}

export interface PublicProductView extends PublicProductCardView {
  images: PublicImageView[];
  business: PublicBusinessView;
}

/** What deleting a stock item or one roll would also remove, shown before confirming. */
export interface StockDeletePreviewView {
  lots: number;
  movements: number;
  /** Expenses that paid for these rolls. Empty without financial access; see the count. */
  expenses: {
    id: string;
    description: string;
    amount: Money;
    /** Also pays for rolls that stay: it is unlinked, never deleted. */
    shared: boolean;
  }[];
  linkedExpenseCount: number;
}

type CollectionKeyView = 'valentines' | 'easter' | 'halloween' | 'christmas';
interface LocalizedTextView {
  pt: string;
  en: string;
}

/** One language's banner: the desktop image, the mobile one and their description. */
export interface CollectionBannerView<TImage = ImageView> {
  desktop: TImage | null;
  mobile: TImage | null;
  alt: string;
}

/** A seasonal collection as the admin edits it. Texts already fall back to the defaults. */
export interface CollectionView {
  key: CollectionKeyView;
  slug: string;
  active: boolean;
  name: LocalizedTextView;
  title: LocalizedTextView;
  intro: LocalizedTextView;
  banners: { pt: CollectionBannerView; en: CollectionBannerView };
  header: ImageView | null;
  /** Visible products that belong to it. */
  productCount: number;
}

/** A collection on the public pages: both languages, so the visitor can switch without a reload. */
export interface PublicCollectionView {
  key: CollectionKeyView;
  slug: string;
  name: LocalizedTextView;
  title: LocalizedTextView;
  intro: LocalizedTextView;
  banners: { pt: CollectionBannerView<PublicImageView>; en: CollectionBannerView<PublicImageView> };
  header: PublicImageView | null;
}

export interface PublicCollectionPageView {
  business: PublicBusinessView;
  collection: PublicCollectionView;
  products: PublicProductCardView[];
  /** True on the admin's preview of a collection that is still hidden. */
  preview: boolean;
}

/** A saved calculation in the list. Amounts are in the calculation's currency. */
export interface CalculationSummaryView {
  id: string;
  name: string;
  product: { id: string; name: string } | null;
  currency: 'CAD' | 'BRL';
  quantity: number;
  unitCost: number;
  /** Null when the price could not be worked out (e.g. a margin of 100%). */
  unitPrice: number | null;
  updatedAt: string;
}

/** A saved calculation with what was entered (micro-units) and the result stored with it. */
export interface CalculationView extends CalculationSummaryView {
  notes: string;
  input: CalcInput;
  result: CalcResult;
}

export interface QuoteLineView {
  productId: string | null;
  calculationId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  /** Quantity × unit price, rounded, minus the discount. */
  amount: number;
  /** Cost components from the linked calculation; null without financial access or when none. */
  breakdown: BreakdownRow[] | null;
  /** The quantity the breakdown was worked out for; a different line quantity hides it. */
  breakdownQuantity: number | null;
}

export interface QuoteHistoryView {
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'cancelled';
  at: string;
  by: string;
  note: string;
}

export interface QuoteView {
  id: string;
  number: number;
  code: string;
  title: string;
  language: 'pt-BR' | 'en';
  currency: 'CAD' | 'BRL';
  issuedAt: string;
  validUntil: string | null;
  status: QuoteHistoryView['status'];
  displayStatus: QuoteHistoryView['status'] | 'expired';
  customerId: string | null;
  customer: { name: string; company: string; email: string; phone: string; address: string };
  lines: QuoteLineView[];
  discount: number;
  delivery: number;
  taxes: { label: string; percent: number; amount: number }[];
  subtotal: number;
  taxBase: number;
  total: number;
  showBreakdown: boolean;
  leadTime: string;
  deliveryMethod: string;
  paymentTerms: string;
  notes: string;
  privateNotes: string;
  history: QuoteHistoryView[];
  /** The order made from this quote, if any. */
  orderId: string | null;
  /** The sale registered from this quote, if any. */
  saleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteSummaryView {
  id: string;
  code: string;
  title: string;
  customerName: string;
  issuedAt: string;
  validUntil: string | null;
  status: QuoteView['status'];
  displayStatus: QuoteView['displayStatus'];
  total: Money;
}

export interface QuoteListView {
  quotes: QuoteSummaryView[];
  /** Over every quote of the business, whatever the filters. */
  counts: Record<QuoteView['displayStatus'], number>;
  /** Quotes that were sent at some point (sent, approved, rejected or expired after sending). */
  sentCount: number;
}

export interface OrderCostView {
  /** What the stock used for this order cost, per currency, after corrections. */
  materials: Money[];
  /** Failed prints and waste recorded against the order. */
  losses: Money[];
  /** Lines from rolls or lots with no known cost. */
  unpricedLines: number;
}

/** A roll from stock picked for an order, with what it needs to draw its spool. */
export interface OrderFilamentView {
  itemId: string;
  name: string;
  /** Null when the roll was deleted from stock since. */
  filament: Pick<FilamentSpecView, 'colorKey' | 'colorHex' | 'materialType'> | null;
  /** The file's estimate in micro-units of grams; null when unknown. */
  grams: number | null;
}

/** A card on the board, or a row in the list. */
export interface OrderCardView {
  id: string;
  title: string;
  type: OrderType;
  status: OrderStatus;
  rank: string;
  quantity: number;
  recipient: { kind: RecipientKind; customerId: string | null; name: string };
  product: { id: string; name: string } | null;
  labelIds: string[];
  dueDate: string | null;
  priority: OrderPriority;
  printer: { id: string; name: string } | null;
  paymentStatus: PaymentStatus;
  /** What the card is waiting for (quote approval, filament…); it stays in its column. */
  blocked: { reason: BlockReason; note: string; since: string } | null;
  filaments: OrderFilamentView[];
  /** The card picture (from the print file or chosen), or null. Changes when it is replaced. */
  pictureUrl: string | null;
  /** Stock lines recorded against the order (corrections included). Zero shows "Confirm print". */
  usageCount: number;
  /** Past the due date and not completed. */
  overdue: boolean;
  /** Sitting in its column past the reminder threshold, unless snoozed. */
  stale: StaleReminder | null;
  snoozedUntil: string | null;
  /** Done long enough ago to be off the active board (still searchable). */
  hidden: boolean;
  quote: { id: string; code: string } | null;
  statusEnteredAt: string;
  completedAt: string | null;
}

export interface OrderHistoryView {
  /** Old entries can name a column of the first board ("printed", "blocked"…). */
  status: OrderStatus | LegacyStatus;
  at: string;
  by: string;
  note: string;
}

export interface OrderView extends OrderCardView {
  description: string;
  orderDate: string;
  plannedStart: string | null;
  material: string;
  colors: string;
  estimatedMinutes: number | null;
  estimatedGrams: number | null;
  finishingNotes: string;
  modelUrl: string;
  internalNotes: string;
  /** Financial fields: null unless the viewer has `finance:view`. */
  agreedPrice: Money | null;
  estimatedCost: Money | null;
  costSummary: OrderCostView | null;
  paidAt: string | null;
  settledAt: string | null;
  lastContactAt: string | null;
  lastProgressAt: string | null;
  /** The sale registered from this order, which then decides its payment. */
  sale: { id: string; code: string } | null;
  history: OrderHistoryView[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderListView {
  orders: OrderCardView[];
  /** Over every order of the business, whatever the filters. */
  counts: { todo: number; inProgress: number; overdue: number; completed: number };
  retentionDays: number;
}

/** A stock line of an order, with the item it came from. */
export interface OrderMovementView extends StockMovementView {
  itemName: string;
  unit: 'g' | 'unit' | 'm' | 'ml' | 'custom';
  customUnit: string;
}

/** An approved quote turned into the starting values of a new order, for review. */
export interface OrderDraftView {
  quote: { id: string; code: string; status: QuoteView['status'] };
  /** An order already made from this quote: open it instead of making a duplicate. */
  existingOrderId: string | null;
  draft: {
    title: string;
    description: string;
    productId: string | null;
    quantity: number;
    recipient: { kind: RecipientKind; customerId: string | null; name: string };
    /** The quote total; null without financial access. */
    agreedPrice: Money | null;
    /** Null without financial access or without a linked calculation. */
    estimatedCost: Money | null;
    estimatedMinutes: number | null;
    /** Micro-units of grams. */
    estimatedGrams: number | null;
  };
}

// ---------------------------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------------------------

export interface SaleLineView {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  /** quantity × unit price, rounded, minus the discount. */
  amount: number;
  estimatedCost: number | null;
  /** The product's labels when the sale was saved. */
  labels: { id: string; name: string }[];
}

export interface SaleReceiptView {
  id: string;
  amount: number;
  receivedAt: string;
  method: PaymentMethod;
  note: string;
  by: string;
}

/** A row in the sales list. Money is in the sale's own currency; cost and profit need finance. */
export interface SaleListItemView {
  id: string;
  code: string;
  saleDate: string;
  customer: { kind: SaleCustomerKind; customerId: string | null; name: string };
  currency: Currency;
  /** "Keychain ×10, Phone stand ×5". */
  items: string;
  total: number;
  received: number;
  outstanding: number;
  payment: SalePayment;
  production: SaleProductionView;
  profit: SaleProfit;
  cancelled: boolean;
  order: { id: string; title: string } | null;
  quote: { id: string; code: string } | null;
}

export interface SaleView extends SaleListItemView {
  lines: SaleLineView[];
  subtotal: number;
  discount: number;
  delivery: number;
  costs: { label: string; amount: number }[];
  receipts: SaleReceiptView[];
  notes: string;
  source: { id: string; name: string } | null;
  /** The production set by hand; a linked order decides `production` instead. */
  manualProduction: SaleProduction;
  /** BRL per CAD saved with the sale, for costs recorded in the other currency. */
  brlPerCad: number | null;
  /** Stock used for this sale (through its order, or recorded on it), per currency. */
  recorded: { materials: Money[]; losses: Money[]; unpricedLines: number; lines: number };
  estimatedCost: number | null;
  cancelReason: string;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaleListView {
  sales: SaleListItemView[];
  /** Over the sales listed, cancelled ones left out; one entry per currency, never mixed. */
  summary: {
    count: number;
    sold: Money[];
    received: Money[];
    receivable: Money[];
    costs: Money[];
    profit: Money[];
    /** Sales whose material cost is still an estimate (or unknown). */
    estimated: number;
  };
}

/** A new sale prefilled from an order, an approved quote or a calculation, for review. */
export interface SaleDraftView {
  from: { kind: 'order' | 'quote' | 'calculation' | 'customer'; id: string; label: string } | null;
  /** A sale already made from this order or quote: open it instead of making another. */
  existingSaleId: string | null;
  draft: {
    customer: { kind: SaleCustomerKind; customerId: string | null; name: string };
    currency: Currency;
    lines: {
      productId: string | null;
      description: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      estimatedCost: number | null;
    }[];
    discount: number;
    delivery: number;
    quoteId: string | null;
    orderId: string | null;
  };
}
