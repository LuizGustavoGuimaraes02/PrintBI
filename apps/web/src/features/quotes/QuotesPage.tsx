import { formatMoney, type QuoteDisplayStatus } from '@printbi/shared';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, cn, EmptyState, PageHeader, PageLoader, Panel } from '../../design-system';
import { STATUS_BADGE, useQuotes } from './queries';

const dateFormat = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeZone: 'UTC' });
const day = (iso: string) => dateFormat.format(new Date(`${iso}T00:00:00Z`));

const TABS: { value: QuoteDisplayStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'sent', label: 'Waiting' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function QuotesPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<QuoteDisplayStatus | ''>('');
  const { data } = useQuotes({ q, status });

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Quotes"
        description="Prices you offered customers, with a PDF in Portuguese or English."
        actions={
          <Link
            to="/quotes/new"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-teal px-6 text-[15px] font-bold text-white hover:bg-teal-strong"
          >
            <Plus size={18} aria-hidden="true" /> New quote
          </Link>
        }
      />
      {data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {(
            [
              ['Drafts', data.counts.draft],
              ['Waiting', data.counts.sent],
              ['Approved', data.counts.approved],
              ['Rejected', data.counts.rejected],
              ['Sent in total', data.sentCount],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="flex flex-col gap-1 rounded-[var(--radius-tile)] bg-surface px-4 py-3"
            >
              <span className="label-mono text-ink-muted">{label}</span>
              <span className="figure text-[22px] font-medium">{value}</span>
            </div>
          ))}
        </div>
      )}
      <Panel>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="flex h-12 items-center gap-2 rounded-full border-[1.5px] border-rule px-4 focus-within:border-teal md:w-80">
            <Search size={18} aria-hidden="true" className="text-steel" />
            <span className="sr-only">Search quotes</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Number, customer or title"
              className="h-full min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="flex w-max gap-1.5">
              {TABS.map((tab) => (
                <button
                  key={tab.value || 'all'}
                  type="button"
                  aria-pressed={status === tab.value}
                  onClick={() => setStatus(tab.value)}
                  className={cn(
                    'h-9 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap',
                    status === tab.value ? 'bg-ink text-white' : 'bg-bench text-ink hover:bg-mist',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {!data ? (
          <PageLoader />
        ) : data.quotes.length === 0 ? (
          <EmptyState
            title={q || status ? 'Nothing found' : 'No quotes yet'}
            action={
              <Link to="/quotes/new" className="font-semibold text-teal">
                Make a quote
              </Link>
            }
          >
            {q || status
              ? 'Try another search or status.'
              : 'Start from a product, a saved calculation or a blank page.'}
          </EmptyState>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[720px] border-collapse text-[15px]">
              <thead>
                <tr className="label-mono text-left text-ink-muted">
                  <th className="border-b border-rule py-2 pr-3 font-medium">Quote</th>
                  <th className="border-b border-rule py-2 pr-3 font-medium">Customer</th>
                  <th className="border-b border-rule py-2 pr-3 font-medium">Date</th>
                  <th className="border-b border-rule py-2 pr-3 font-medium">Valid until</th>
                  <th className="border-b border-rule py-2 pr-3 text-right font-medium">Total</th>
                  <th className="border-b border-rule py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.quotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-bench">
                    <td className="border-b border-rule-soft py-3 pr-3">
                      <Link
                        to={`/quotes/${quote.id}`}
                        className="figure font-medium text-teal hover:underline"
                      >
                        {quote.code}
                      </Link>
                      {quote.title && (
                        <span className="block text-[13px] text-ink-muted">{quote.title}</span>
                      )}
                    </td>
                    <td className="border-b border-rule-soft py-3 pr-3">{quote.customerName}</td>
                    <td className="figure border-b border-rule-soft py-3 pr-3 text-[13px]">
                      {day(quote.issuedAt)}
                    </td>
                    <td className="figure border-b border-rule-soft py-3 pr-3 text-[13px]">
                      {quote.validUntil ? day(quote.validUntil) : '—'}
                    </td>
                    <td className="figure border-b border-rule-soft py-3 pr-3 text-right">
                      {formatMoney(quote.total)}
                    </td>
                    <td className="border-b border-rule-soft py-3">
                      <Badge tone={STATUS_BADGE[quote.displayStatus].tone}>
                        {STATUS_BADGE[quote.displayStatus].label}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
