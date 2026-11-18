/**
 * Response shapes of the API, shared with the web app. Dates are ISO strings;
 * money is `{ amount, currency }` with `amount` in integer micro-units.
 */
import type { Money } from './money';
import type { Permission, Role } from './permissions';

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
