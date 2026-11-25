import {
  COLLECTION_KEYS,
  CURRENCIES,
  PRINTER_STATUSES,
  RISK_BASES,
  ROLES,
  SHOWCASE_LANGUAGES,
  toMicro,
} from '@printbi/shared';
import { imageSchema } from '../../core/db-schemas/image.schema';
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
      /** Last time the defaults were saved; the setup checklist uses it. */
      reviewedAt: { type: Date, default: null },
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
    inventory: {
      /** Grams (micro-units) below which a filament roll warns, unless it sets its own. */
      rollLowStockThreshold: { ...microField(), default: 100_000_000 },
    },
  },
  { _id: false },
);

const printerSchema = new Schema({
  modelId: { type: Schema.Types.ObjectId, ref: 'PrinterModel', default: null },
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

/** Product labels (Keychain, Fridge magnet...), shared by the catalog, sales filters and showcase. */
const labelSchema = new Schema({
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#E2F1F3' },
  archivedAt: { type: Date, default: null },
});

/** Where customers come from (WhatsApp, Referral, Instagram...). */
const customerSourceSchema = new Schema({
  name: { type: String, required: true, trim: true },
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

const localizedSchema = new Schema(
  { pt: { type: String, default: '' }, en: { type: String, default: '' } },
  { _id: false },
);
const bannerSchema = new Schema(
  {
    desktop: { type: imageSchema, default: null },
    mobile: { type: imageSchema, default: null },
  },
  { _id: false },
);

/**
 * A seasonal collection (Valentine's Day, Easter, Halloween, Christmas). Only edited ones are
 * stored; the rest use their defaults and stay hidden. Empty texts fall back to the defaults.
 */
const collectionSchema = new Schema(
  {
    key: { type: String, enum: COLLECTION_KEYS, required: true },
    active: { type: Boolean, default: false },
    name: { type: localizedSchema, default: () => ({}) },
    title: { type: localizedSchema, default: () => ({}) },
    intro: { type: localizedSchema, default: () => ({}) },
    alt: { type: localizedSchema, default: () => ({}) },
    banners: {
      pt: { type: bannerSchema, default: () => ({}) },
      en: { type: bannerSchema, default: () => ({}) },
    },
    header: { type: imageSchema, default: null },
  },
  { _id: false },
);

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    website: { type: String, trim: true },
    social: { type: String, trim: true },
    /** Public link name: /s/<slug>. Unique across businesses. */
    slug: { type: String, default: null },
    logo: { type: imageSchema, default: null },
    showcase: {
      published: { type: Boolean, default: false },
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      language: { type: String, enum: SHOWCASE_LANGUAGES, default: 'pt-BR' },
      whatsapp: { type: String, default: '' },
      messageTemplate: { type: String, default: '' },
    },
    collections: { type: [collectionSchema], default: [] },
    /** Sequence numbers, raised atomically with $inc: ORC-0001, VEN-0001. */
    counters: {
      quote: { type: Number, default: 0 },
      sale: { type: Number, default: 0 },
    },
    settings: { type: settingsSchema, default: () => ({}) },
    printers: { type: [printerSchema], default: [] },
    labels: { type: [labelSchema], default: [] },
    customerSources: { type: [customerSourceSchema], default: [] },
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
companySchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } },
);

export type Company = InferSchemaType<typeof companySchema>;
export type CompanyDocument = HydratedDocument<Company>;
export const CompanyModel = model('Company', companySchema);
