'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, ShieldAlert } from 'lucide-react';
import type { EscrowState } from '@mezzo/shared-types';
import { useAuthStore } from '../../../lib/auth-store';
import { useEscrowWizardStore } from '../../../lib/escrow-wizard-store';
import { listEscrows } from '../../../lib/escrow-client';
import { getKycStatus } from '../../../lib/kyc-client';
import { PAYOUT_MIN_TIER, verificationBlocks } from '../../../lib/kyc-tiers';
import { ApiError } from '../../../lib/api-error';
import { buttonVariants } from '../../../components/ui/button';
import { Pagination } from '../../../components/ui/pagination';
import { EscrowList } from '../../../components/escrow/escrow-list';
import { DraftList } from '../../../components/escrow/draft-list';
import { EscrowFilters, type EscrowSortOption } from '../../../components/escrow/escrow-filters';
import { VerifyPrompt } from '../../../components/kyc/verify-prompt';

const PAGE_SIZE = 20;

export default function DashboardPage() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const resetWizard = useEscrowWizardStore((state) => state.reset);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<EscrowState | 'ALL'>('ALL');
  const [sort, setSort] = useState<EscrowSortOption>('updatedAt:desc');

  const [sortBy, sortDir] = useMemo(() => {
    const [by, dir] = sort.split(':');
    return [by as 'updatedAt' | 'createdAt' | 'price', dir as 'asc' | 'desc'];
  }, [sort]);

  const hasActiveFilters = search.trim() !== '' || stateFilter !== 'ALL';

  const escrowsQuery = useQuery({
    queryKey: ['escrows', { page, search, stateFilter, sortBy, sortDir }],
    queryFn: () =>
      listEscrows({
        page,
        pageSize: PAGE_SIZE,
        search: search.trim() || undefined,
        state: stateFilter === 'ALL' ? undefined : stateFilter,
        sortBy,
        sortDir,
      }),
    enabled: status === 'authenticated',
    placeholderData: keepPreviousData,
  });

  const kycQuery = useQuery({
    queryKey: ['kyc-status'],
    queryFn: getKycStatus,
    enabled: status === 'authenticated',
  });

  const escrows = escrowsQuery.data?.items ?? [];
  const total = escrowsQuery.data?.total ?? 0;
  const totalPages = escrowsQuery.data?.totalPages ?? 1;
  const drafts = escrows.filter((escrow) => escrow.state === 'DRAFT');
  const started = escrows.filter((escrow) => escrow.state !== 'DRAFT');

  const kycStatus = kycQuery.data ?? null;
  const needsVerification = kycStatus ? verificationBlocks(kycStatus, PAYOUT_MIN_TIER) : false;

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateStateFilter(value: EscrowState | 'ALL') {
    setStateFilter(value);
    setPage(1);
  }

  function updateSort(value: EscrowSortOption) {
    setSort(value);
    setPage(1);
  }

  function clearFilters() {
    setSearch('');
    setStateFilter('ALL');
    setPage(1);
  }

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

      {kycStatus && needsVerification ? (
        <div className="mt-6">
          <VerifyPrompt
            status={kycStatus}
            requiredTier={PAYOUT_MIN_TIER}
            reason="Verify your identity to withdraw funds and raise your transaction limits. It only takes a minute."
          />
        </div>
      ) : null}

      <div className="mt-8">
        <EscrowFilters
          search={search}
          onSearchChange={updateSearch}
          state={stateFilter}
          onStateChange={updateStateFilter}
          sort={sort}
          onSortChange={updateSort}
        />
      </div>

      <div className="mt-4">
        {status === 'pending' || (escrowsQuery.isLoading && !escrowsQuery.data) ? (
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
            <p className="text-sm text-fog">
              {hasActiveFilters ? 'No escrows match your filters' : 'No escrows yet'}
            </p>
            <p className="mt-1.5 max-w-xs text-[13px] text-mute">
              {hasActiveFilters
                ? 'Try a different search term or clear the filters below.'
                : "Start one to document an item's condition and invite the other party."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 text-sm text-mint underline underline-offset-4"
              >
                Clear filters
              </button>
            ) : (
              <Link
                href="/escrow/new"
                onClick={resetWizard}
                className="mt-4 text-sm text-mint underline underline-offset-4"
              >
                Create an escrow
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {drafts.length > 0 ? <DraftList drafts={drafts} /> : null}
            {started.length > 0 ? (
              <EscrowList escrows={started} currentUserId={user?.id ?? ''} />
            ) : null}
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
