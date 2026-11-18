import { PRINTER_STATUSES, RISK_BASES, ROLES, CURRENCIES, toMicro } from '@printbi/shared';
import { microField, moneySchema } from '../../core/db-schemas/money.schema';
import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** Pending and past invitations. Only the hash of the token is stored. */
const inviteSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ROLES, required: true },
  finance: { type: Boolean, default: false },
  tokenHash: { type: String, required: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: () => new Date() },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  usedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  revokedAt: { type: Date, default: null },
});

const days = (fallback: number) => ({ type: Number, min: 0, max: 365, default: fallback });

/** Company-wide defaults. Every value can still be overridden on each record. */
const settingsSchema = new Schema(
  {
    currency: {
      defaultCurrency: { type: String, enum: CURRENCIES, default: 'CAD' },
      brlPerCad: { ...microField(false), default: null },
      rateUpdatedAt: { type: Date, default: null },
    },
    calculator: {
      energyPricePerKwh: {
        type: moneySchema,
        default: () => ({ amount: toMicro('0.15'), currency: 'CAD' }),
      },
      laborRatePerHour: {
        type: moneySchema,
        default: () => ({ amount: toMicro('15'), currency: 'CAD' }),
      },
      targetMarginPercent: { ...microField(false), default: null },
      riskPercent: { ...microField(), default: 0 },
      riskBase: { type: String, enum: RISK_BASES, default: 'filament' },
      quoteValidityDays: days(15),
      paymentTerms: { type: String, default: '', maxlength: 1000 },
    },
    reminders: {
      enabled: { type: Boolean, default: true },
      quoteWaitingDays: days(3),
      approvedNotStartedDays: days(3),
      inProgressDays: days(3),
      blockedDays: days(3),
      printedDays: days(3),
    },
    board: { completedRetentionDays: days(7) },
  },
  { _id: false },
);

const printerSchema = new Schema({
  name: { type: String, required: true, trim: true },
  brand: { type: String, default: '' },
  model: { type: String, default: '' },
  purchasedAt: { type: Date, default: null },
  purchaseCost: { type: moneySchema, default: null },
  powerWatts: { type: Number, default: null },
  costPerHour: { type: moneySchema, default: null },
  recovery: {
    type: new Schema(
      {
        years: microField(),
        hoursPerDay: microField(),
        daysPerYear: microField(),
        maintenance: {
          kind: { type: String, enum: ['amount', 'percent'], required: true },
          amount: microField(false),
          percent: microField(false),
        },
      },
      { _id: false },
    ),
    default: null,
  },
  status: { type: String, enum: PRINTER_STATUSES, default: 'active' },
  notes: { type: String, default: '' },
  archivedAt: { type: Date, default: null },
});

const categorySchema = new Schema({
  name: { type: String, required: true, trim: true },
  archivedAt: { type: Date, default: null },
});

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Filament',
  'Materials',
  'Packaging',
  'Tools',
  'Printer',
  'Maintenance',
  'Energy',
  'Software',
  'Transport',
  'Fees',
  'Other',
] as const;

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    website: { type: String, trim: true },
    social: { type: String, trim: true },
    settings: { type: settingsSchema, default: () => ({}) },
    printers: { type: [printerSchema], default: [] },
    expenseCategories: {
      type: [categorySchema],
      default: () => DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ name })),
    },
    invites: { type: [inviteSchema], default: [], select: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

companySchema.index({ 'invites.tokenHash': 1 }, { sparse: true });

export type Company = InferSchemaType<typeof companySchema>;
export type CompanyDocument = HydratedDocument<Company>;
export const CompanyModel = model('Company', companySchema);
