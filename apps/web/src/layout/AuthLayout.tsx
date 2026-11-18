import type { ReactNode } from 'react';
import { NozzleLoader, SpoolMark } from '../design-system';

interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

/** Sign-in pages: brand panel with the printing nozzle, form card beside it. */
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex flex-col justify-between gap-10 bg-mist px-6 py-8 md:px-12 lg:w-[46%] lg:py-12">
        <div className="flex items-center gap-2.5">
          <SpoolMark />
          <span className="text-xl font-extrabold tracking-[-0.02em]">PrintBI</span>
        </div>
        <div className="hidden flex-col gap-6 lg:flex">
          <h2 className="max-w-md text-[44px] leading-[1.02] font-extrabold tracking-[-0.035em]">
            Every spool, quote and print job in one place.
          </h2>
          <p className="max-w-md text-lg text-ink-muted">
            Know what is on the shelf, what it costs, what to print next and what you earned.
          </p>
          <div className="self-start rounded-[var(--radius-card)] bg-surface px-6 py-4">
            <NozzleLoader label="Printing layer 1" />
          </div>
        </div>
        <span className="label-mono hidden text-ink-muted lg:block">
          For small 3D-printing shops
        </span>
      </aside>
      <main className="flex flex-1 items-start justify-center bg-surface px-4 py-10 md:items-center md:px-12">
        <div className="flex w-full max-w-md flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.03em]">{title}</h1>
            {subtitle && <p className="text-ink-muted">{subtitle}</p>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
