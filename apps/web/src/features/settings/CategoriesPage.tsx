import { zodResolver } from '@hookform/resolvers/zod';
import { categoryInputSchema, type CategoryView } from '@printbi/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Badge, Button, Notice, PageLoader, Panel, TextField } from '../../design-system';
import { api } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import { useCan } from '../auth/account';
import { companyBase, keys, useCategories, useSaving } from './queries';

export function CategoriesPage() {
  const { data: categories } = useCategories();
  const canManage = useCan('settings:manage');
  if (!categories) return <PageLoader />;

  return (
    <Panel
      title="Expense categories"
      description="Group expenses for reports. Archived categories stay on the expenses that use them."
    >
      {canManage && <NewCategoryForm />}
      <ul className="flex flex-col">
        {categories.map((category) => (
          <CategoryRow key={category.id} category={category} canManage={canManage} />
        ))}
      </ul>
    </Panel>
  );
}

function NewCategoryForm() {
  const create = useSaving(
    (values: { name: string }) =>
      api.post<CategoryView>(`${companyBase}/expense-categories`, values),
    [keys.categories],
    'Category added',
  );
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<{ name: string }>({
    resolver: zodResolver(categoryInputSchema, undefined, { raw: true }),
    defaultValues: { name: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values);
      reset();
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="New category"
          placeholder="e.g. Shipping"
          className="min-w-60 flex-1"
          error={errors.name?.message}
          {...register('name')}
        />
        <Button type="submit" loading={create.isPending}>
          Add
        </Button>
      </div>
      {errors.root?.server && (
        <Notice tone="attention" title="Not added">
          {errors.root.server.message}
        </Notice>
      )}
    </form>
  );
}

function CategoryRow({ category, canManage }: { category: CategoryView; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const update = useSaving(
    (input: { name?: string; archived?: boolean }) =>
      api.patch<CategoryView>(`${companyBase}/expense-categories/${category.id}`, input),
    [keys.categories],
    'Category saved',
  );

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-soft py-3 first:border-t-0">
      {editing ? (
        <form
          className="flex flex-1 flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ name }, { onSuccess: () => setEditing(false) });
          }}
        >
          <TextField
            label="Category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-60 flex-1"
            autoFocus
          />
          <Button type="submit" size="sm" loading={update.isPending}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setName(category.name);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <span className="flex items-center gap-3">
            <span className={category.archived ? 'text-ink-muted line-through' : 'font-semibold'}>
              {category.name}
            </span>
            {category.archived && <Badge>archived</Badge>}
          </span>
          {canManage && (
            <span className="flex gap-2">
              {!category.archived && (
                <Button size="sm" variant="soft" onClick={() => setEditing(true)}>
                  Rename
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                loading={update.isPending}
                onClick={() => update.mutate({ archived: !category.archived })}
              >
                {category.archived ? 'Restore' : 'Archive'}
              </Button>
            </span>
          )}
        </>
      )}
    </li>
  );
}
