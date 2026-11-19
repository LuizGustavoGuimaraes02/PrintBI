import { customerInputSchema, type CustomerView } from '@printbi/shared';
import { Controller, useForm } from 'react-hook-form';
import { Button, Modal, Notice, TextAreaField, TextField, useToast } from '../../design-system';
import { api } from '../../lib/api';
import { applyServerErrors, formResolver } from '../../lib/forms';
import { useRefreshCustomers } from './queries';
import { SourceField } from './SourceField';

interface CustomerForm {
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  sourceId: string | null;
  sourceDetail: string;
}

const EMPTY: CustomerForm = {
  name: '',
  company: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  sourceId: null,
  sourceDetail: '',
};

interface CustomerDialogProps {
  /** Editing an existing customer; omit to create one. */
  customer?: CustomerView;
  /** Pre-fills the name, e.g. with what was typed in a customer search. */
  initialName?: string;
  onClose: () => void;
  onSaved?: (customer: CustomerView) => void;
}

/**
 * Create or edit a customer without leaving the screen. Quotes, orders and sales open
 * this same dialog to add someone new on the spot.
 */
export function CustomerDialog({
  customer,
  initialName = '',
  onClose,
  onSaved,
}: CustomerDialogProps) {
  const toast = useToast();
  const refresh = useRefreshCustomers();
  const { register, handleSubmit, setError, formState, control } = useForm<CustomerForm>({
    defaultValues: customer
      ? {
          name: customer.name,
          company: customer.company,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
          notes: customer.notes,
          sourceId: customer.source?.id ?? null,
          sourceDetail: customer.sourceDetail,
        }
      : { ...EMPTY, name: initialName },
    resolver: formResolver<CustomerForm>(customerInputSchema),
  });
  const { errors } = formState;

  const save = handleSubmit(async (values) => {
    try {
      const saved = customer
        ? await api.put<CustomerView>(`/customers/${customer.id}`, values)
        : await api.post<CustomerView>('/customers', values);
      await refresh();
      toast.success(customer ? 'Customer updated' : 'Customer added', saved.name);
      onSaved?.(saved);
      onClose();
    } catch (error) {
      applyServerErrors(error, setError);
    }
  });

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={customer ? 'Edit customer' : 'New customer'}
      description={customer ? undefined : 'Only the name is required. Fill in the rest any time.'}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" loading={formState.isSubmitting}>
            {customer ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <form
        id="customer-form"
        onSubmit={(e) => void save(e)}
        noValidate
        className="grid gap-5 sm:grid-cols-2"
      >
        <TextField
          label="Name"
          required
          autoFocus
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Company"
          autoComplete="off"
          error={errors.company?.message}
          {...register('company')}
        />
        <TextField
          label="Phone or WhatsApp"
          type="tel"
          autoComplete="off"
          hint="With the country code, e.g. +55 11 98888-7777"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <Controller
          control={control}
          name="sourceId"
          render={({ field, fieldState }) => (
            <SourceField
              value={field.value}
              onChange={field.onChange}
              error={fieldState.error?.message}
            />
          )}
        />
        <TextField
          label="Source details"
          autoComplete="off"
          placeholder="e.g. referred by Maria"
          error={errors.sourceDetail?.message}
          {...register('sourceDetail')}
        />
        <TextField
          label="Address"
          autoComplete="off"
          className="sm:col-span-2"
          error={errors.address?.message}
          {...register('address')}
        />
        <TextAreaField
          label="Notes"
          rows={3}
          className="sm:col-span-2"
          hint="Preferences, delivery details, anything worth remembering."
          error={errors.notes?.message}
          {...register('notes')}
        />
        {errors.root?.server && (
          <div className="sm:col-span-2">
            <Notice tone="attention" title="Not saved">
              {errors.root.server.message}
            </Notice>
          </div>
        )}
      </form>
    </Modal>
  );
}
