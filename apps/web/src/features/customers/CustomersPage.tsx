import type { CustomerView } from '@printbi/shared';
import { Plus, Signpost, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Badge,
  Button,
  cn,
  EmptyState,
  PageHeader,
  PageLoader,
  SelectField,
  TextField,
} from '../../design-system';
import { CustomerDialog } from './CustomerDialog';
import { ManageSourcesDialog } from './ManageSourcesDialog';
import { useCustomers, useCustomerSources, type CustomerFilters } from './queries';

const NO_FILTERS: CustomerFilters = { q: '', sourceId: '', archived: false };

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap',
        on ? 'bg-ink text-white' : 'bg-bench text-ink hover:bg-rule-soft',
      )}
    >
      {children}
    </button>
  );
}

function CustomerRow({ customer }: { customer: CustomerView }) {
  const contact = [customer.phone, customer.email].filter(Boolean);
  return (
    <li>
      <Link
        to={`/customers/${customer.id}`}
        className="grid gap-x-5 gap-y-1 rounded-[var(--radius-tile)] px-3 py-4 hover:bg-bench sm:grid-cols-[1fr_auto] sm:items-center"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="text-[16px]">{customer.name}</strong>
            {customer.archived && <Badge>Archived</Badge>}
          </span>
          {(customer.company || customer.source) && (
            <span className="truncate text-[13px] text-ink-muted">
              {[customer.company, customer.source && `via ${customer.source.name}`]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </span>
        <span className="figure flex flex-col gap-0.5 text-[13px] text-ink-muted sm:items-end">
          {contact.length > 0 ? (
            contact.map((c) => <span key={c}>{c}</span>)
          ) : (
            <span>No contact yet</span>
          )}
        </span>
      </Link>
    </li>
  );
}

export function CustomersPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<CustomerFilters>(NO_FILTERS);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const { data: sources } = useCustomerSources();
  const { data: customers, isPending, isFetching } = useCustomers(filters);
  // A cached empty list may be stale (e.g. right after adding one): wait for the refetch.
  const refetchingEmpty = isFetching && customers?.length === 0;
  const filtered = Boolean(filters.q || filters.sourceId || filters.archived);
  const activeSources = sources?.filter((src) => !src.archived) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Customers"
        description="Who buys from you, how to reach them, and what they have ordered."
        actions={
          <>
            <Button
              variant="soft"
              icon={<Signpost size={18} aria-hidden="true" />}
              onClick={() => setManaging(true)}
            >
              Sources
            </Button>
            <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setAdding(true)}>
              Add customer
            </Button>
          </>
        }
      />
      <section
        aria-label="Customers"
        className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-surface p-5 md:p-6"
      >
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label="Search"
            placeholder="Name, company, phone or email"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            className="min-w-56 flex-1"
          />
          <SelectField
            label="Status"
            value={filters.archived ? 'archived' : 'active'}
            onChange={(e) => setFilters((f) => ({ ...f, archived: e.target.value === 'archived' }))}
            className="w-40"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </SelectField>
        </div>

        {activeSources.length > 0 && (
          <div role="group" aria-label="Filter by source" className="flex flex-wrap gap-2">
            <Chip
              on={!filters.sourceId}
              onClick={() => setFilters((f) => ({ ...f, sourceId: '' }))}
            >
              Any source
            </Chip>
            {activeSources.map((src) => (
              <Chip
                key={src.id}
                on={filters.sourceId === src.id}
                onClick={() => setFilters((f) => ({ ...f, sourceId: src.id }))}
              >
                {src.name}
                <span className="figure text-[12px] opacity-70">{src.customerCount}</span>
              </Chip>
            ))}
            <Chip
              on={filters.sourceId === 'none'}
              onClick={() => setFilters((f) => ({ ...f, sourceId: 'none' }))}
            >
              Not set
            </Chip>
          </div>
        )}

        {(isPending || refetchingEmpty) && <PageLoader label="Loading customers" />}
        {customers && customers.length === 0 && !refetchingEmpty && (
          <EmptyState
            title={filtered ? 'No customer matches' : 'No customers yet'}
            action={
              filtered ? (
                <Button
                  variant="soft"
                  icon={<SlidersHorizontal size={16} aria-hidden="true" />}
                  onClick={() => setFilters(NO_FILTERS)}
                >
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setAdding(true)}>Add your first customer</Button>
              )
            }
          >
            {filtered
              ? 'Try another search, source or status.'
              : 'Customers can also be added on the spot while writing a quote or a sale.'}
          </EmptyState>
        )}
        {customers && customers.length > 0 && (
          <ul className="flex flex-col divide-y divide-rule-soft">
            {customers.map((c) => (
              <CustomerRow key={c.id} customer={c} />
            ))}
          </ul>
        )}
      </section>
      {adding && (
        <CustomerDialog
          initialName={filters.q?.trim() ?? ''}
          onClose={() => setAdding(false)}
          onSaved={(c) => void navigate(`/customers/${c.id}`)}
        />
      )}
      {managing && <ManageSourcesDialog onClose={() => setManaging(false)} />}
    </>
  );
}
