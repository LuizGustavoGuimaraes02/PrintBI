import {
  calculate,
  machineRatePerHour,
  roundToCents,
  type CalcInput,
  type CalculationSummaryView,
  type CalculationView,
  type CalcResult,
  type calculationFiltersSchema,
  type calculationSaveSchema,
  type Money,
} from '@printbi/shared';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { NotFoundError, ValidationError } from '../../core/errors';
import { CompanyModel } from '../companies/company.model';
import { InventoryItemModel } from '../inventory/inventory.model';
import { ProductModel } from '../products/product.model';
import { CalculationModel } from './calculation.model';

type SaveInput = z.output<typeof calculationSaveSchema>;

const fieldError = (path: string, message: string) =>
  new ValidationError(message, [{ path, message }]);

interface LotRecord {
  _id: Types.ObjectId;
  label: string;
  remaining: number;
  unitCost?: Money | null;
}

/**
 * Replaces what the browser sent with what the records say: the cost and stock of each picked
 * roll or lot, the picked printer's rate and the company's CAD/BRL rate. The saved result is
 * then worked out from facts, not from whatever the page had.
 */
async function resolveInput(companyId: Types.ObjectId, input: CalcInput): Promise<CalcInput> {
  const itemIds = [...input.filament.lines, ...input.materials.lines]
    .filter((l) => l.source === 'stock' && l.itemId)
    .map((l) => new Types.ObjectId(l.itemId as string));
  const [items, company] = await Promise.all([
    itemIds.length
      ? InventoryItemModel.find({ companyId, _id: { $in: itemIds } }, { name: 1, lots: 1 }).lean()
      : [],
    CompanyModel.findById(companyId, { 'settings.currency': 1, printers: 1 }).lean(),
  ]);
  if (!company) throw new NotFoundError('Company');

  const lotFor = (section: string, index: number, itemId: string | null, lotId: string | null) => {
    const item = items.find((i) => i._id.toString() === itemId);
    const lot = (item?.lots as unknown as LotRecord[] | undefined)?.find(
      (l) => l._id.toString() === lotId,
    );
    if (!item || !lot) {
      throw fieldError(
        `input.${section}.lines.${index}`,
        'That stock item or lot no longer exists',
      );
    }
    return { item, lot };
  };

  const filamentLines = input.filament.lines.map((line, index) => {
    if (line.source !== 'stock') return line;
    const { item, lot } = lotFor('filament', index, line.itemId, line.lotId);
    return {
      ...line,
      label: line.label || `${item.name} · ${lot.label}`,
      costPerGram: lot.unitCost
        ? { amount: lot.unitCost.amount, currency: lot.unitCost.currency }
        : line.costPerGram,
      available: lot.remaining,
    };
  });
  const materialLines = input.materials.lines.map((line, index) => {
    if (line.source !== 'stock') return line;
    const { item, lot } = lotFor('materials', index, line.itemId, line.lotId);
    return {
      ...line,
      label: line.label || `${item.name} · ${lot.label}`,
      // A lot bought without a price keeps the price typed on the page.
      unitPrice: lot.unitCost
        ? { amount: lot.unitCost.amount, currency: lot.unitCost.currency }
        : line.unitPrice,
      available: lot.remaining,
    };
  });

  let machine = input.machine;
  if (machine.mode === 'printer') {
    const printer = company.printers.find((p) => p._id.toString() === machine.printerId);
    if (!printer) throw fieldError('input.machine.printerId', 'Pick one of your printers');
    let ratePerHour: Money | null = printer.costPerHour
      ? { amount: printer.costPerHour.amount, currency: printer.costPerHour.currency }
      : null;
    if (!ratePerHour && printer.recovery && printer.purchaseCost) {
      const r = printer.recovery;
      const rate = machineRatePerHour({
        purchase: printer.purchaseCost.amount,
        maintenance:
          r.maintenance?.kind === 'percent'
            ? { kind: 'percent', percent: r.maintenance.percent ?? 0 }
            : { kind: 'amount', amount: r.maintenance?.amount ?? 0 },
        years: r.years,
        daysPerYear: r.daysPerYear,
        hoursPerDay: r.hoursPerDay,
      });
      ratePerHour =
        rate === null ? null : { amount: rate, currency: printer.purchaseCost.currency };
    }
    machine = { ...machine, label: printer.name, ratePerHour };
  }

  return {
    ...input,
    filament: { ...input.filament, lines: filamentLines },
    materials: { ...input.materials, lines: materialLines },
    machine,
    brlPerCad: company.settings?.currency?.brlPerCad ?? null,
  };
}

interface CalculationRecord {
  _id: Types.ObjectId;
  name: string;
  productId?: Types.ObjectId | null;
  notes?: string | null;
  currency: CalculationSummaryView['currency'];
  quantity: number;
  unitCost: number;
  unitPrice?: number | null;
  input: CalcInput;
  result: CalcResult;
  updatedAt: Date;
}

async function productNames(companyId: Types.ObjectId, rows: CalculationRecord[]) {
  const ids = rows.flatMap((r) => (r.productId ? [r.productId] : []));
  if (!ids.length) return new Map<string, string>();
  const products = await ProductModel.find({ companyId, _id: { $in: ids } }, { name: 1 }).lean();
  return new Map(products.map((p) => [p._id.toString(), p.name]));
}

const summary = (row: CalculationRecord, names: Map<string, string>): CalculationSummaryView => {
  const productId = row.productId?.toString() ?? null;
  const productName = productId ? names.get(productId) : undefined;
  return {
    id: row._id.toString(),
    name: row.name,
    product: productId && productName ? { id: productId, name: productName } : null,
    currency: row.currency,
    quantity: row.quantity,
    unitCost: row.unitCost,
    unitPrice: row.unitPrice ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
};

export async function listCalculations(
  companyId: Types.ObjectId,
  filters: z.output<typeof calculationFiltersSchema>,
): Promise<CalculationSummaryView[]> {
  const query: Record<string, unknown> = { companyId };
  if (filters.productId) query.productId = new Types.ObjectId(filters.productId);
  if (filters.q) query.name = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const rows = (await CalculationModel.find(query, { input: 0, result: 0 })
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean()) as unknown as CalculationRecord[];
  const names = await productNames(companyId, rows);
  return rows.map((r) => summary(r, names));
}

export async function getCalculation(
  companyId: Types.ObjectId,
  id: Types.ObjectId,
): Promise<CalculationView> {
  const row = (await CalculationModel.findOne({
    _id: id,
    companyId,
  }).lean()) as unknown as CalculationRecord | null;
  if (!row) throw new NotFoundError('Calculation');
  const names = await productNames(companyId, [row]);
  return { ...summary(row, names), notes: row.notes ?? '', input: row.input, result: row.result };
}

/** Works out the result on the server, from the records, before anything is stored. */
async function evaluate(companyId: Types.ObjectId, input: SaveInput) {
  if (input.productId && !(await ProductModel.exists({ _id: input.productId, companyId }))) {
    throw fieldError('productId', 'Product not found');
  }
  const resolved = await resolveInput(companyId, input.input);
  const result = calculate(resolved);
  if (!result.complete) {
    throw fieldError(
      'input',
      'Some lines are in another currency. Set the CAD/BRL rate in Settings → Currency first.',
    );
  }
  return { resolved, result };
}

function fields(input: SaveInput, resolved: CalcInput, result: CalcResult) {
  return {
    name: input.name,
    productId: input.productId ? new Types.ObjectId(input.productId) : null,
    notes: input.notes,
    currency: resolved.currency,
    quantity: resolved.quantity,
    unitCost: result.unitCost,
    unitPrice: result.price?.unit ?? null,
    input: resolved,
    result,
  };
}

/** Writes the unit cost (rounded to cents) as the product's estimated cost, when asked. */
async function updateProductCost(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  input: SaveInput,
  result: CalcResult,
) {
  if (!input.updateProductCost || !input.productId) return;
  await ProductModel.updateOne(
    { _id: input.productId, companyId },
    {
      $set: { estimatedCost: { amount: roundToCents(result.unitCost), currency: result.currency } },
    },
  );
  await audit({
    companyId,
    actorId,
    action: 'product.cost_from_calculation',
    entity: 'product',
    entityId: new Types.ObjectId(input.productId),
  });
}

export async function createCalculation(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  input: SaveInput,
): Promise<CalculationView> {
  const { resolved, result } = await evaluate(companyId, input);
  const created = await CalculationModel.create({
    ...fields(input, resolved, result),
    companyId,
    createdBy: actorId,
  });
  await updateProductCost(companyId, actorId, input, result);
  await audit({
    companyId,
    actorId,
    action: 'calculation.created',
    entity: 'calculation',
    entityId: created._id,
  });
  return getCalculation(companyId, created._id);
}

export async function updateCalculation(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
  input: SaveInput,
): Promise<CalculationView> {
  if (!(await CalculationModel.exists({ _id: id, companyId })))
    throw new NotFoundError('Calculation');
  const { resolved, result } = await evaluate(companyId, input);
  await CalculationModel.updateOne(
    { _id: id, companyId },
    { $set: fields(input, resolved, result) },
  );
  await updateProductCost(companyId, actorId, input, result);
  await audit({
    companyId,
    actorId,
    action: 'calculation.updated',
    entity: 'calculation',
    entityId: id,
  });
  return getCalculation(companyId, id);
}

export async function deleteCalculation(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  id: Types.ObjectId,
): Promise<void> {
  const row = await CalculationModel.findOneAndDelete(
    { _id: id, companyId },
    { projection: { name: 1 } },
  ).lean();
  if (!row) throw new NotFoundError('Calculation');
  await audit({
    companyId,
    actorId,
    action: 'calculation.deleted',
    entity: 'calculation',
    entityId: id,
    reason: row.name,
  });
}
