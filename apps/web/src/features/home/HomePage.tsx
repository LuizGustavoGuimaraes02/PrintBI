import { Check } from 'lucide-react';
import { Link } from 'react-router';
import { cn, FilamentBar, PageHeader, Panel } from '../../design-system';
import { useAccount, useCan } from '../auth/account';
import { useCompany, useMembers, usePrinters, useSettings } from '../settings/queries';

interface Step {
  title: string;
  detail: string;
  to: string;
  done: boolean;
}

/** First screen after sign-in until the dashboard arrives: a setup checklist built from real data. */
export function HomePage() {
  const { data: account } = useAccount();
  const canManage = useCan('settings:manage');
  const { data: company } = useCompany();
  const { data: printers } = usePrinters();
  const { data: members } = useMembers();
  const { data: settings } = useSettings();

  const steps: Step[] = [
    {
      title: 'Add your business contact details',
      detail: 'They appear on quotes and on your showcase.',
      to: '/settings/business',
      done: Boolean(company && (company.email || company.phone)),
    },
    {
      title: 'Register your printers',
      detail: 'Assign jobs to them and price machine time.',
      to: '/settings/printers',
      done: (printers?.length ?? 0) > 0,
    },
    {
      title: 'Review calculator defaults',
      detail: 'Energy price, labor rate, margin and quote terms.',
      to: '/settings/calculator',
      done: Boolean(settings?.calculator.reviewedAt),
    },
    {
      title: 'Invite your team',
      detail: 'Optional. Employees see finances only if you allow it.',
      to: '/settings/team',
      done: (members?.length ?? 0) > 1,
    },
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <>
      <PageHeader
        eyebrow={account?.activeCompany?.name ?? 'Dashboard'}
        title={`Hello, ${account?.user.firstName ?? ''}`}
        description="Your dashboard fills up as you record stock, orders and sales. Start by setting up the workshop."
      />
      <Panel
        title="Set up your workshop"
        description={canManage ? undefined : 'Your admin handles most of these steps.'}
      >
        <FilamentBar
          value={done}
          max={steps.length}
          label="Setup progress"
          readout={`${done} / ${steps.length} done`}
        />
        <ol className="flex flex-col">
          {steps.map((step, index) => (
            <li key={step.to} className="border-t border-rule-soft first:border-t-0">
              <Link
                to={step.to}
                className="flex items-center gap-4 rounded-[var(--radius-tile)] px-2 py-4 hover:bg-bench"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'figure grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold',
                    step.done ? 'bg-teal text-white' : 'bg-bench text-ink-muted',
                  )}
                >
                  {step.done ? <Check size={18} /> : index + 1}
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="font-bold">
                    {step.title}
                    <span className="sr-only">{step.done ? ' (done)' : ' (to do)'}</span>
                  </span>
                  <span className="text-sm text-ink-muted">{step.detail}</span>
                </span>
                <span className="text-sm font-semibold text-teal">
                  {step.done ? 'Review' : 'Start'}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}
