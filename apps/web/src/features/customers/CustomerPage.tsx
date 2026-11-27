import { formatMoney, type CustomerView } from '@printbi/shared';
import { ArrowLeft, Mail, MessageCircle, Phone } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Button,
  ConfirmDialog,
  DeleteAction,
  EmptyState,
  Notice,
  PageHeader,
  PageLoader,
  Panel,
  useToast,
} from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { useCan } from '../auth/account';
import { useSales } from '../sales/queries';
import { CustomerDialog } from './CustomerDialog';
import { useCustomer, useRefreshCustomers, whatsappLink } from './queries';

const dateFormat = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium' });

export function CustomerPage() {
  const { customerId = '' } = useParams();
  const { data: customer, isPending } = useCustomer(customerId);
  if (isPending) return <PageLoader label="Loading customer" />;
  if (!customer) {
    return (
      <EmptyState
        title="Customer not found"
        action={
          <Link to="/customers" className="font-semibold text-teal">
            Back to customers
          </Link>
        }
      >
        It may belong to another business.
      </EmptyState>
    );
  }
  return <CustomerDetail customer={customer} />;
}

const contactLink =
  'inline-flex h-10 items-center gap-2 rounded-full bg-teal-soft px-4 text-sm font-bold text-teal-ink hover:bg-[#d3eaee]';

function CustomerDetail({ customer }: { customer: CustomerView }) {
  const toast = useToast();
  const refresh = useRefreshCustomers();
  const canArchive = useCan('records:archive');
  const canSeeFinance = useCan('finance:view');
  const canManageMoney = useCan('finance:manage');
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const navigate = useNavigate();
  const whatsapp = whatsappLink(customer.phone);

  const setArchived = async (archived: boolean) => {
    try {
      await api.post(`/customers/${customer.id}/archive`, { archived });
      await refresh();
      toast.success(archived ? 'Archived' : 'Restored', customer.name);
    } catch (e) {
      toast.error('Not changed', e instanceof ApiError ? e.message : undefined);
    } finally {
      setArchiving(false);
    }
  };

  const rows: [string, string][] = [
    ['Company', customer.company],
    ['Phone', customer.phone],
    ['Email', customer.email],
    ['Address', customer.address],
    ['Came from', [customer.source?.name, customer.sourceDetail].filter(Boolean).join(' · ')],
  ];

  return (
    <>
      <Link
        to="/customers"
        className="inline-flex items-center gap-1.5 self-start px-1 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Customers
      </Link>
      <PageHeader
        eyebrow={`Customer since ${dateFormat.format(new Date(customer.createdAt))}`}
        title={customer.name}
        description={customer.company || undefined}
        actions={
          <>
            <Link
              to={`/quotes/new?customer=${customer.id}`}
              className="inline-flex h-12 items-center rounded-full bg-teal px-6 text-[15px] font-bold text-white hover:bg-teal-strong"
            >
              Create quote
            </Link>
            {canManageMoney && (
              <Link
                to={`/sales/new?customer=${customer.id}`}
                className="inline-flex h-12 items-center rounded-full bg-teal-soft px-6 text-[15px] font-bold text-teal-ink hover:bg-[#d3eaee]"
              >
                Register sale
              </Link>
            )}
            <Link
              to={`/orders/new?customer=${customer.id}`}
              className="inline-flex h-12 items-center rounded-full bg-teal-soft px-6 text-[15px] font-bold text-teal-ink hover:bg-[#d3eaee]"
            >
              New order
            </Link>
            <Button variant="soft" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {canArchive &&
              (customer.archived ? (
                <Button
                  variant="soft"
                  hint="Puts them back in the customer list and the pickers."
                  onClick={() => void setArchived(false)}
                >
                  Restore
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  hint="Hides them from the list and from new quotes. Their history stays."
                  onClick={() => setArchiving(true)}
                >
                  Archive
                </Button>
              ))}
            {canArchive && (
              <DeleteAction
                title={`Delete ${customer.name}?`}
                description="Removed for good. Use it for a customer added by mistake; archive one you no longer serve, to keep their history."
                confirmLabel="Delete customer"
                hint="Deletes them for good, for a customer added by mistake. Archive keeps their history."
                onDelete={async () => {
                  try {
                    await api.delete(`/customers/${customer.id}`);
                  } catch (e) {
                    toast.error('Not deleted', e instanceof ApiError ? e.message : undefined);
                    throw e;
                  }
                  toast.success('Customer deleted', customer.name);
                  void navigate('/customers', { replace: true });
                  await refresh();
                }}
              />
            )}
          </>
        }
      />
      {customer.archived && (
        <Notice title="Archived">
          Hidden from customer lists and new quotes. Past records keep this customer.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel title="Contact">
          {(whatsapp || customer.phone || customer.email) && (
            <div className="flex flex-wrap gap-2">
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className={contactLink}>
                  <MessageCircle size={16} aria-hidden="true" /> WhatsApp
                </a>
              )}
              {customer.phone && (
                <a href={`tel:${customer.phone.replace(/[^\d+]/g, '')}`} className={contactLink}>
                  <Phone size={16} aria-hidden="true" /> Call
                </a>
              )}
              {customer.email && (
                <a href={`mailto:${customer.email}`} className={contactLink}>
                  <Mail size={16} aria-hidden="true" /> Email
                </a>
              )}
            </div>
          )}
          <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-[15px]">
            {rows.map(([term, value]) => (
              <div key={term} className="contents">
                <dt className="label-mono pt-0.5 text-ink-muted">{term}</dt>
                <dd className={value ? 'break-words' : 'text-ink-muted'}>{value || '—'}</dd>
              </div>
            ))}
          </dl>
          {customer.notes && (
            <div className="flex flex-col gap-1 rounded-[var(--radius-tile)] bg-bench p-4">
              <span className="label-mono text-ink-muted">Notes</span>
              <p className="whitespace-pre-line">{customer.notes}</p>
            </div>
          )}
        </Panel>

        <Panel title="History">
          <div className="grid grid-cols-2 gap-4 border-b border-rule-soft pb-5">
            <div className="flex flex-col gap-1">
              <span className="label-mono text-ink-muted">Sales</span>
              <span className="figure text-[28px] leading-tight font-medium">
                {customer.salesCount}
              </span>
            </div>
            {canSeeFinance && (
              <div className="flex flex-col gap-1">
                <span className="label-mono text-ink-muted">Total bought</span>
                <span className="figure text-[28px] leading-tight font-medium">
                  {customer.totalPurchased.length > 0
                    ? customer.totalPurchased.map((m) => formatMoney(m)).join(' + ')
                    : '—'}
                </span>
              </div>
            )}
          </div>
          {canSeeFinance ? (
            <CustomerSales customerId={customer.id} firstName={customer.name.split(' ')[0] ?? ''} />
          ) : (
            <p className="text-[15px] text-ink-muted">
              Sales are shown to people with financial access.
            </p>
          )}
        </Panel>
      </div>

      {editing && <CustomerDialog customer={customer} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title="Archive this customer?"
        description="They leave the customer list and can't be picked for new quotes. Past records keep them, and you can restore them later."
        confirmLabel="Archive"
        onConfirm={() => void setArchived(true)}
      />
    </>
  );
}

/** This customer's sales, newest first, with what is still owed. */
function CustomerSales({ customerId, firstName }: { customerId: string; firstName: string }) {
  const { data } = useSales({ customerId, cancelled: 'false' });
  if (!data) return <PageLoader label="Loading sales" />;
  if (data.sales.length === 0) {
    return <EmptyState title="No sales yet">Sales for {firstName} will be listed here.</EmptyState>;
  }
  const owed = data.summary.receivable.filter((m) => m.amount > 0);
  return (
    <div className="flex flex-col gap-3">
      {owed.length > 0 && (
        <p className="text-[15px] font-semibold text-hot-ink">
          Still to receive {owed.map((m) => formatMoney(m)).join(' + ')}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-rule-soft">
        {data.sales.map((sale) => (
          <li key={sale.id}>
            <Link
              to={`/sales/${sale.id}`}
              className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-baseline gap-3 rounded-xl px-2 py-2.5 hover:bg-bench"
            >
              <span className="figure text-[13px] font-semibold">{sale.code}</span>
              <span className="truncate text-[14px]">{sale.items}</span>
              <span className="figure text-[14px] font-semibold">
                {formatMoney({ amount: sale.total, currency: sale.currency })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
