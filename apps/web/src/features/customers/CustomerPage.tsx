import { formatMoney, type CustomerView } from '@printbi/shared';
import { ArrowLeft, Mail, MessageCircle, Phone } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Notice,
  PageHeader,
  PageLoader,
  Panel,
  useToast,
} from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { useCan } from '../auth/account';
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
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
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
            <Button variant="soft" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {canArchive &&
              (customer.archived ? (
                <Button variant="soft" onClick={() => void setArchived(false)}>
                  Restore
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setArchiving(true)}>
                  Archive
                </Button>
              ))}
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
          <EmptyState title="No quotes or sales yet">
            Quotes, orders and sales for {customer.name.split(' ')[0]} will be listed here.
          </EmptyState>
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
