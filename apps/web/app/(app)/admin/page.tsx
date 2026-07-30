'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import type { DisputeState } from '@mezzo/shared-types';
import { useAuthStore } from '../../../lib/auth-store';
import { listAdminDisputes } from '../../../lib/admin-client';
import { ApiError } from '../../../lib/api-error';
import { DISPUTE_REASON_LABELS, DISPUTE_STATE_LABELS } from '../../../lib/dispute-labels';
import { formatDateTime } from '../../../lib/format-date';
import { formatRemaining } from '../../../lib/format-duration';
import { ArbitrationBadge } from '../../../components/admin/arbitration-badge';
import { Select } from '../../../components/ui/select';
import { Label } from '../../../components/ui/label';

const STATE_FILTERS: (DisputeState | 'ALL')[] = ['ALL', 'EVIDENCE', 'UNDER_REVIEW', 'RESOLVED'];

export default function AdminDisputeQueuePage() {
  const sessionStatus = useAuthStore((state) => state.status);
  const [stateFilter, setStateFilter] = useState<DisputeState | 'ALL'>('ALL');

  const queueQuery = useQuery({
    queryKey: ['admin-disputes', stateFilter],
    queryFn: () => listAdminDisputes(stateFilter === 'ALL' ? undefined : stateFilter),
    enabled: sessionStatus === 'authenticated',
  });

  const summaries = [...(queueQuery.data ?? [])].sort(
    (a, b) =>
      new Date(a.dispute.createdAt).getTime() - new Date(b.dispute.createdAt).getTime(),
  );

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
            Dispute queue
          </h1>
          <p className="mt-1 text-sm text-fog">
            Oldest first. The AI proposes; you decide and execute.
          </p>
        </div>
        <div className="w-full sm:w-52">
          <Label htmlFor="state-filter">Filter by state</Label>
          <Select
            id="state-filter"
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value as DisputeState | 'ALL')}
          >
            {STATE_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value === 'ALL' ? 'All states' : DISPUTE_STATE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-8">
        {queueQuery.isLoading ? (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : queueQuery.isError ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
            <ShieldAlert className="h-6 w-6 text-mute" />
            <p className="mt-3 text-sm text-vellum">
              {queueQuery.error instanceof ApiError
                ? queueQuery.error.message
                : 'Could not load the dispute queue.'}
            </p>
          </div>
        ) : summaries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-mute">
            No disputes in this state.
          </div>
        ) : (
          <ul className="space-y-3">
            {summaries.map(({ dispute, latestArbitrationRecord }) => (
              <li key={dispute.id}>
                <Link
                  href={`/admin/disputes/${dispute.id}`}
                  className="block rounded-xl border border-line-soft bg-surface p-4 hover:border-line"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-vellum">
                        {DISPUTE_REASON_LABELS[dispute.reasonCode]}
                      </p>
                      <p className="mt-1 font-mono text-[12px] uppercase tracking-wide text-mute">
                        {DISPUTE_STATE_LABELS[dispute.state]}
                      </p>
                    </div>
                    <ArbitrationBadge record={latestArbitrationRecord} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-mute">
                    <span>
                      Open for{' '}
                      <span className="font-mono tabular">
                        {formatRemaining(Date.now() - new Date(dispute.createdAt).getTime())}
                      </span>
                    </span>
                    <span>Raised {formatDateTime(dispute.createdAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
