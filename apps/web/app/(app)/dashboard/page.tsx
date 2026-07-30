'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../lib/auth-store';
import { useEscrowWizardStore } from '../../../lib/escrow-wizard-store';
import { listEscrows } from '../../../lib/escrow-client';
import { ApiError } from '../../../lib/api-error';
import { buttonVariants } from '../../../components/ui/button';
import { EscrowList } from '../../../components/escrow/escrow-list';
import { DraftList } from '../../../components/escrow/draft-list';

export default function DashboardPage() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const resetWizard = useEscrowWizardStore((state) => state.reset);

  const escrowsQuery = useQuery({
    queryKey: ['escrows'],
    queryFn: listEscrows,
    enabled: status === 'authenticated',
  });

  const escrows = escrowsQuery.data ?? [];
  const drafts = escrows.filter((escrow) => escrow.state === 'DRAFT');
  const started = escrows.filter((escrow) => escrow.state !== 'DRAFT');

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

      <div className="mt-8">
        {status === 'pending' || escrowsQuery.isLoading ? (
          <div className="space-y-2">
            <div className="h-16 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-16 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : escrowsQuery.isError ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
            <ShieldAlert className="h-6 w-6 text-mute" />
            <p className="mt-3 text-sm text-vellum">
              {escrowsQuery.error instanceof ApiError
                ? escrowsQuery.error.message
                : 'Could not load your escrows.'}
            </p>
            <button
              type="button"
              onClick={() => void escrowsQuery.refetch()}
              className="mt-4 text-sm text-mint underline underline-offset-4"
            >
              Try again
            </button>
          </div>
        ) : escrows.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center sm:py-20">
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
        ) : (
          <div className="space-y-8">
            {drafts.length > 0 ? <DraftList drafts={drafts} /> : null}
            {started.length > 0 ? (
              <EscrowList escrows={started} currentUserId={user?.id ?? ''} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
