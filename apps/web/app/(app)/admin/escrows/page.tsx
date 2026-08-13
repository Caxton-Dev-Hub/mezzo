'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import type { AdminEscrowResponse, EscrowState } from '@mezzo/shared-types';
import { useAuthStore } from '../../../../lib/auth-store';
import { listAdminEscrows } from '../../../../lib/admin-client';
import { ApiError } from '../../../../lib/api-error';
import { ESCROW_STATE_LABELS } from '../../../../lib/escrow-state-labels';
import { formatDateTime } from '../../../../lib/format-date';
import { formatMoney } from '../../../../lib/money';
import { Label } from '../../../../components/ui/label';
import { Select } from '../../../../components/ui/select';

const STATE_FILTERS: (EscrowState | 'ALL')[] = [
  'ALL',
  'DRAFT',
  'PENDING_COUNTERPARTY',
  'AGREED',
  'FUNDED',
  'SHIPPED',
  'DELIVERED',
  'DISPUTED',
  'RESOLVED_RELEASE',
  'RESOLVED_REFUND',
  'RELEASED',
  'REFUNDED',
  'CANCELLED',
  'EXPIRED',
];

function partyEmail(escrow: AdminEscrowResponse, role: 'BUYER' | 'SELLER'): string {
  return escrow.parties.find((party) => party.role === role)?.email ?? '—';
}

export default function AdminEscrowsPage() {
  const sessionStatus = useAuthStore((state) => state.status);
  const [stateFilter, setStateFilter] = useState<EscrowState | 'ALL'>('ALL');

  const escrowsQuery = useQuery({
    queryKey: ['admin-escrows', stateFilter],
    queryFn: () => listAdminEscrows(stateFilter === 'ALL' ? undefined : stateFilter),
    enabled: sessionStatus === 'authenticated',
  });

  const escrows = escrowsQuery.data ?? [];

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
            All escrows
          </h1>
          <p className="mt-1 text-sm text-fog">
            Every trade on the platform, most recently touched first.
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Label htmlFor="escrow-state-filter">Filter by state</Label>
          <Select
            id="escrow-state-filter"
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value as EscrowState | 'ALL')}
          >
            {STATE_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value === 'ALL' ? 'All states' : ESCROW_STATE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-8">
        {escrowsQuery.isLoading ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : escrowsQuery.isError ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
            <ShieldAlert className="h-6 w-6 text-mute" />
            <p className="mt-3 text-sm text-vellum">
              {escrowsQuery.error instanceof ApiError
                ? escrowsQuery.error.message
                : 'Could not load escrows.'}
            </p>
          </div>
        ) : escrows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-mute">
            No escrows in this state.
          </div>
        ) : (
          <ul className="space-y-3">
            {escrows.map((escrow) => (
              <li
                key={escrow.id}
                className="rounded-xl border border-line-soft bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-vellum">
                      {escrow.itemDescription ?? 'Terms not set'}
                    </p>
                    <p className="mt-1 font-mono text-[12px] uppercase tracking-wide text-mute">
                      {ESCROW_STATE_LABELS[escrow.state]}
                    </p>
                  </div>
                  {escrow.price ? (
                    <p className="shrink-0 font-mono text-sm tabular text-vellum">
                      {formatMoney(escrow.price.amount, escrow.price.currency)}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-mute">
                  <span>Buyer {partyEmail(escrow, 'BUYER')}</span>
                  <span>Seller {partyEmail(escrow, 'SELLER')}</span>
                  <span>Updated {formatDateTime(escrow.updatedAt)}</span>
                  {escrow.requiresVerification ? <span>Verification required</span> : null}
                </div>

                <Link
                  href={`/escrow/${escrow.id}`}
                  className="mt-3 inline-block text-[13px] text-mint hover:underline"
                >
                  Open escrow
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
