'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useAuthStore } from '../../../lib/auth-store';
import { useEscrowWizardStore } from '../../../lib/escrow-wizard-store';
import { buttonVariants } from '../../../components/ui/button';

export default function DashboardPage() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const resetWizard = useEscrowWizardStore((state) => state.reset);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
            {status === 'authenticated' && user ? `Welcome, ${user.email}` : 'Welcome'}
          </h1>
          <p className="mt-2 text-sm text-fog">
            Your escrows will show up here once you start one. Money you&apos;ve received lives in
            your{' '}
            <Link href="/wallet" className="text-mint underline underline-offset-4">
              wallet
            </Link>
            .
          </p>
        </div>
        <Link
          href="/escrow/new"
          onClick={resetWizard}
          className={buttonVariants({ className: 'gap-2 sm:w-auto' })}
        >
          <Plus className="h-4 w-4" />
          New escrow
        </Link>
      </div>

      <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center sm:py-20">
        <p className="text-sm text-fog">No escrows yet</p>
        <p className="mt-1.5 max-w-xs text-[13px] text-mute">
          Start one to document an item&apos;s condition and invite the other party.
        </p>
        <Link
          href="/escrow/new"
          onClick={resetWizard}
          className="mt-4 text-sm text-mint underline underline-offset-4"
        >
          Create an escrow
        </Link>
      </div>
    </div>
  );
}
