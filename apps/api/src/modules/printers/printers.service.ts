import type { Money, PrinterView, printerInputSchema } from '@printbi/shared';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { NotFoundError } from '../../core/errors';
import { CompanyModel } from '../companies/company.model';

type PrinterInput = z.output<typeof printerInputSchema>;

interface PrinterRecord {
  _id: Types.ObjectId;
  name: string;
  brand?: string | null;
  model?: string | null;
  purchasedAt?: Date | null;
  purchaseCost?: Money | null;
  powerWatts?: number | null;
  costPerHour?: Money | null;
  recovery?: {
    years: number;
    hoursPerDay: number;
    daysPerYear: number;
    maintenance: { kind: 'amount' | 'percent'; amount?: number | null; percent?: number | null };
  } | null;
  status?: 'active' | 'maintenance' | 'retired' | null;
  notes?: string | null;
  archivedAt?: Date | null;
}

const money = (value?: Money | null): Money | null =>
  value ? { amount: value.amount, currency: value.currency } : null;

/** Cost fields are stripped for members without financial access. */
export function toPrinterView(printer: PrinterRecord, canSeeFinance: boolean): PrinterView {
  const recovery = printer.recovery;
  return {
    id: printer._id.toString(),
    name: printer.name,
    brand: printer.brand ?? '',
    model: printer.model ?? '',
    purchasedAt: printer.purchasedAt?.toISOString() ?? null,
    powerWatts: printer.powerWatts ?? null,
    status: printer.status ?? 'active',
    notes: printer.notes ?? '',
    purchaseCost: canSeeFinance ? money(printer.purchaseCost) : null,
    costPerHour: canSeeFinance ? money(printer.costPerHour) : null,
    recovery:
      canSeeFinance && recovery
        ? {
            years: recovery.years,
            hoursPerDay: recovery.hoursPerDay,
            daysPerYear: recovery.daysPerYear,
            maintenance:
              recovery.maintenance.kind === 'amount'
                ? { kind: 'amount', amount: recovery.maintenance.amount ?? 0 }
                : { kind: 'percent', percent: recovery.maintenance.percent ?? 0 },
          }
        : null,
  };
}

export async function listPrinters(
  companyId: Types.ObjectId,
  canSeeFinance: boolean,
): Promise<PrinterView[]> {
  const company = await CompanyModel.findById(companyId, { printers: 1 }).lean();
  return (company?.printers ?? [])
    .filter((printer) => !printer.archivedAt)
    .map((printer) => toPrinterView(printer as PrinterRecord, canSeeFinance));
}

async function findPrinter(companyId: Types.ObjectId, printerId: Types.ObjectId) {
  const company = await CompanyModel.findOne(
    { _id: companyId, printers: { $elemMatch: { _id: printerId, archivedAt: null } } },
    { 'printers.$': 1 },
  ).lean();
  const printer = company?.printers[0];
  if (!printer) throw new NotFoundError('Printer');
  return printer as PrinterRecord;
}

export async function createPrinter(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  input: PrinterInput,
): Promise<PrinterView> {
  const printer = { _id: new Types.ObjectId(), ...input };
  await CompanyModel.updateOne(
    { _id: companyId },
    { $push: { printers: printer } },
    { runValidators: true },
  );
  await audit({
    companyId,
    actorId,
    action: 'printer.created',
    entity: 'printer',
    entityId: printer._id,
  });
  return toPrinterView(await findPrinter(companyId, printer._id), true);
}

export async function updatePrinter(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  printerId: Types.ObjectId,
  input: PrinterInput,
): Promise<PrinterView> {
  const set = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [`printers.$.${key}`, value]),
  );
  const result = await CompanyModel.updateOne(
    { _id: companyId, printers: { $elemMatch: { _id: printerId, archivedAt: null } } },
    { $set: set },
    { runValidators: true },
  );
  if (result.matchedCount !== 1) throw new NotFoundError('Printer');
  await audit({
    companyId,
    actorId,
    action: 'printer.updated',
    entity: 'printer',
    entityId: printerId,
  });
  return toPrinterView(await findPrinter(companyId, printerId), true);
}

/** Archived, never deleted: past orders and costs keep pointing at it. */
export async function archivePrinter(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  printerId: Types.ObjectId,
): Promise<void> {
  const result = await CompanyModel.updateOne(
    { _id: companyId, printers: { $elemMatch: { _id: printerId, archivedAt: null } } },
    { $set: { 'printers.$.archivedAt': new Date() } },
  );
  if (result.matchedCount !== 1) throw new NotFoundError('Printer');
  await audit({
    companyId,
    actorId,
    action: 'printer.archived',
    entity: 'printer',
    entityId: printerId,
  });
}
