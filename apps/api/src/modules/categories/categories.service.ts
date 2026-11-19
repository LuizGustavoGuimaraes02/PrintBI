import type { CategoryView, updateCategorySchema } from '@printbi/shared';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { ConflictError, NotFoundError } from '../../core/errors';
import { CompanyModel } from '../companies/company.model';
import { ExpenseModel } from '../expenses/expense.model';

interface CategoryRecord {
  _id: Types.ObjectId;
  name: string;
  archivedAt?: Date | null;
}

const toView = (category: CategoryRecord): CategoryView => ({
  id: category._id.toString(),
  name: category.name,
  archived: Boolean(category.archivedAt),
});

const sameName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

async function loadCategories(companyId: Types.ObjectId): Promise<CategoryRecord[]> {
  const company = await CompanyModel.findById(companyId, { expenseCategories: 1 });
  if (!company) throw new NotFoundError('Company');
  return company.expenseCategories.map((c) => ({
    _id: c._id,
    name: c.name,
    archivedAt: c.archivedAt,
  }));
}

export async function listCategories(companyId: Types.ObjectId): Promise<CategoryView[]> {
  return (await loadCategories(companyId))
    .map(toView)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
}

function assertUniqueName(categories: CategoryRecord[], name: string, exceptId?: Types.ObjectId) {
  const clash = categories.find(
    (c) => !c.archivedAt && sameName(c.name, name) && !(exceptId && c._id.equals(exceptId)),
  );
  if (clash) throw new ConflictError(`A category named "${clash.name}" already exists`);
}

export async function createCategory(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  name: string,
): Promise<CategoryView> {
  assertUniqueName(await loadCategories(companyId), name);
  const category = { _id: new Types.ObjectId(), name, archivedAt: null };
  await CompanyModel.updateOne({ _id: companyId }, { $push: { expenseCategories: category } });
  await audit({
    companyId,
    actorId,
    action: 'category.created',
    entity: 'category',
    entityId: category._id,
  });
  return toView(category);
}

export async function updateCategory(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  categoryId: Types.ObjectId,
  input: z.output<typeof updateCategorySchema>,
): Promise<CategoryView> {
  const categories = await loadCategories(companyId);
  const current = categories.find((c) => c._id.equals(categoryId));
  if (!current) throw new NotFoundError('Category');

  const name = input.name ?? current.name;
  const archived = input.archived ?? Boolean(current.archivedAt);
  if (!archived) assertUniqueName(categories, name, categoryId);

  const archivedAt = archived ? (current.archivedAt ?? new Date()) : null;
  await CompanyModel.updateOne(
    { _id: companyId, 'expenseCategories._id': categoryId },
    { $set: { 'expenseCategories.$.name': name, 'expenseCategories.$.archivedAt': archivedAt } },
  );
  await audit({
    companyId,
    actorId,
    action: 'category.updated',
    entity: 'category',
    entityId: categoryId,
    changes: input,
  });
  return toView({ _id: categoryId, name, archivedAt });
}

/**
 * Deletes a category nobody uses. One that expenses point at is archived instead: deleting it
 * would leave those expenses without a category.
 */
export async function deleteCategory(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  categoryId: Types.ObjectId,
): Promise<void> {
  const inUse = await ExpenseModel.countDocuments({ companyId, categoryId });
  if (inUse > 0) {
    throw new ConflictError(
      `${inUse === 1 ? 'An expense uses' : `${inUse} expenses use`} this category. Archive it instead, or move ${inUse === 1 ? 'it' : 'them'} to another category first.`,
    );
  }
  const result = await CompanyModel.updateOne(
    { _id: companyId, 'expenseCategories._id': categoryId },
    { $pull: { expenseCategories: { _id: categoryId } } },
  );
  if (result.matchedCount !== 1) throw new NotFoundError('Category');
  await audit({
    companyId,
    actorId,
    action: 'expense_category.deleted',
    entity: 'expense_category',
    entityId: categoryId,
  });
}
