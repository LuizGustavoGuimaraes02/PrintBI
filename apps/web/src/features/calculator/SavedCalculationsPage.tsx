import { formatMoney } from '@printbi/shared';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, PageHeader, PageLoader, Panel } from '../../design-system';
import { useCan } from '../auth/account';
import { useCalculations } from './queries';

const dateFormat = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium' });

/** Saved calculator runs, newest first. */
export function SavedCalculationsPage() {
  const canUse = useCan('finance:view');
  const [q, setQ] = useState('');
  const { data: calculations } = useCalculations(q);
  if (!canUse) {
    return (
      <EmptyState title="The calculator needs financial access">
        Ask your admin to turn it on for you.
      </EmptyState>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Saved calculations"
        description="Costs and prices you worked out before. Open one to change it or start from it."
        actions={
          <Link
            to="/calculator"
            className="inline-flex h-12 items-center rounded-full bg-teal px-6 text-[15px] font-bold text-white hover:bg-teal-strong"
          >
            New calculation
          </Link>
        }
      />
      <Panel>
        <label className="flex h-12 items-center gap-2 rounded-full border-[1.5px] border-rule px-4 focus-within:border-teal sm:max-w-md">
          <Search size={18} aria-hidden="true" className="text-steel" />
          <span className="sr-only">Search calculations</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name"
            className="h-full min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        {!calculations ? (
          <PageLoader />
        ) : calculations.length === 0 ? (
          <EmptyState
            title={q ? 'Nothing found' : 'No saved calculations yet'}
            action={
              <Link to="/calculator" className="font-semibold text-teal">
                Open the calculator
              </Link>
            }
          >
            {q ? 'Try another name.' : 'Save one from the calculator to find it here.'}
          </EmptyState>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[640px] border-collapse text-[15px]">
              <thead>
                <tr className="label-mono text-left text-ink-muted">
                  <th className="border-b border-rule py-2 pr-3 font-medium">Name</th>
                  <th className="border-b border-rule py-2 pr-3 text-right font-medium">Pieces</th>
                  <th className="border-b border-rule py-2 pr-3 text-right font-medium">
                    Cost / piece
                  </th>
                  <th className="border-b border-rule py-2 pr-3 text-right font-medium">
                    Price / piece
                  </th>
                  <th className="border-b border-rule py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {calculations.map((c) => (
                  <tr key={c.id} className="hover:bg-bench">
                    <td className="border-b border-rule-soft py-3 pr-3">
                      <Link to={`/calculator/${c.id}`} className="font-semibold hover:underline">
                        {c.name}
                      </Link>
                      {c.product && (
                        <span className="block text-[13px] text-ink-muted">{c.product.name}</span>
                      )}
                    </td>
                    <td className="figure border-b border-rule-soft py-3 pr-3 text-right">
                      {c.quantity}
                    </td>
                    <td className="figure border-b border-rule-soft py-3 pr-3 text-right">
                      {formatMoney({ amount: c.unitCost, currency: c.currency })}
                    </td>
                    <td className="figure border-b border-rule-soft py-3 pr-3 text-right">
                      {c.unitPrice === null
                        ? '—'
                        : formatMoney({ amount: c.unitPrice, currency: c.currency })}
                    </td>
                    <td className="border-b border-rule-soft py-3 text-[13px] text-ink-muted">
                      {dateFormat.format(new Date(c.updatedAt))}
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
