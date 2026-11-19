import type { CompanySettingsView, updateSettingsSchema } from '@printbi/shared';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { NotFoundError } from '../../core/errors';
import { AuditLogModel } from '../../core/audit/audit-log.model';
import { CompanyModel } from '../companies/company.model';

type SettingsDoc = NonNullable<InstanceType<typeof CompanyModel>['settings']>;

function toView(settings: SettingsDoc): CompanySettingsView {
  const { currency, calculator, reminders, board } = settings;
  return {
    currency: {
      defaultCurrency: currency?.defaultCurrency ?? 'CAD',
      brlPerCad: currency?.brlPerCad ?? null,
      rateUpdatedAt: currency?.rateUpdatedAt?.toISOString() ?? null,
    },
    calculator: {
      energyPricePerKwh: {
        amount: calculator?.energyPricePerKwh?.amount ?? 0,
        currency: calculator?.energyPricePerKwh?.currency ?? 'CAD',
      },
      laborRatePerHour: {
        amount: calculator?.laborRatePerHour?.amount ?? 0,
        currency: calculator?.laborRatePerHour?.currency ?? 'CAD',
      },
      targetMarginPercent: calculator?.targetMarginPercent ?? null,
      riskPercent: calculator?.riskPercent ?? 0,
      riskBase: calculator?.riskBase ?? 'filament',
      quoteValidityDays: calculator?.quoteValidityDays ?? 15,
      paymentTerms: calculator?.paymentTerms ?? '',
      reviewedAt: calculator?.reviewedAt?.toISOString() ?? null,
    },
    reminders: {
      enabled: reminders?.enabled ?? true,
      quoteWaitingDays: reminders?.quoteWaitingDays ?? 3,
      approvedNotStartedDays: reminders?.approvedNotStartedDays ?? 3,
      inProgressDays: reminders?.inProgressDays ?? 3,
      blockedDays: reminders?.blockedDays ?? 3,
      printedDays: reminders?.printedDays ?? 3,
    },
    board: { completedRetentionDays: board?.completedRetentionDays ?? 7 },
    inventory: { rollLowStockThreshold: settings.inventory?.rollLowStockThreshold ?? 100_000_000 },
  };
}

async function loadSettings(companyId: Types.ObjectId): Promise<SettingsDoc> {
  // Hydrated (not lean) so schema defaults fill sections that were never saved.
  const company = await CompanyModel.findById(companyId, { settings: 1 });
  if (!company?.settings) throw new NotFoundError('Company');
  return company.settings;
}

export async function getSettings(companyId: Types.ObjectId): Promise<CompanySettingsView> {
  const settings = await loadSettings(companyId);
  if (settings.calculator && !settings.calculator.reviewedAt) {
    // Saved before reviewedAt existed: the audit log knows when the calculator was last saved.
    const saved = await AuditLogModel.findOne(
      { companyId, action: 'settings.updated', 'changes.calculator': { $exists: true } },
      { createdAt: 1 },
    )
      .sort({ createdAt: -1 })
      .lean();
    if (saved?.createdAt) {
      await CompanyModel.updateOne(
        { _id: companyId, 'settings.calculator.reviewedAt': null },
        { $set: { 'settings.calculator.reviewedAt': saved.createdAt } },
      );
      settings.calculator.reviewedAt = saved.createdAt;
    }
  }
  return toView(settings);
}

export async function updateSettings(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  input: z.output<typeof updateSettingsSchema>,
): Promise<CompanySettingsView> {
  const set: Record<string, unknown> = {};

  if (input.currency) {
    const current = await loadSettings(companyId);
    set['settings.currency.defaultCurrency'] = input.currency.defaultCurrency;
    set['settings.currency.brlPerCad'] = input.currency.brlPerCad;
    if (input.currency.brlPerCad !== (current.currency?.brlPerCad ?? null)) {
      set['settings.currency.rateUpdatedAt'] =
        input.currency.brlPerCad === null ? null : new Date();
    }
  }
  if (input.calculator)
    set['settings.calculator'] = { ...input.calculator, reviewedAt: new Date() };
  if (input.reminders) set['settings.reminders'] = input.reminders;
  if (input.board) set['settings.board'] = input.board;
  if (input.inventory) set['settings.inventory'] = input.inventory;

  if (Object.keys(set).length > 0) {
    await CompanyModel.updateOne({ _id: companyId }, { $set: set }, { runValidators: true });
    await audit({
      companyId,
      actorId,
      action: 'settings.updated',
      entity: 'company',
      entityId: companyId,
      changes: input,
    });
  }
  return getSettings(companyId);
}
