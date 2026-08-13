'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../../lib/auth-store';
import { listAdminAtRisk } from '../../../../lib/admin-client';
import { ApiError } from '../../../../lib/api-error';
import { RISK_KIND_LABELS, RISK_REASON_LABELS } from '../../../../lib/admin-risk-labels';
import { formatDateTime } from '../../../../lib/format-date';
import { formatMoney } from '../../../../lib/money';

export default function AdminAtRiskPage() {
  const sessionStatus = useAuthStore((state) => state.status);

  const riskQuery = useQuery({
    queryKey: ['admin-at-risk'],
    queryFn: listAdminAtRisk,
    enabled: sessionStatus === 'authenticated',
  });

  const items = riskQuery.data ?? [];

  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Needs attention
      </h1>
      <p className="mt-1 text-sm text-fog">
        Trades and payments that have sat too long in a state they should have left. Most overdue
        first.
      </p>

      <div className="mt-8">
        {riskQuery.isLoading ? (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : riskQuery.isError ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
            <ShieldAlert className="h-6 w-6 text-mute" />
            <p className="mt-3 text-sm text-vellum">
              {riskQuery.error instanceof ApiError
                ? riskQuery.error.message
                : 'Could not load the attention queue.'}
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-mute">
            Nothing is overdue. Everything is moving.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={`${item.kind}-${item.id}`}
                className="rounded-xl border border-line-soft bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-vellum">{RISK_REASON_LABELS[item.reason]}</p>
                    <p className="mt-1 font-mono text-[12px] uppercase tracking-wide text-mute">
                      {RISK_KIND_LABELS[item.kind]}
                    </p>
                  </div>
                  {item.amount ? (
                    <p className="shrink-0 font-mono text-sm tabular text-vellum">
                      {formatMoney(item.amount.amount, item.amount.currency)}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-mute">
                  <span>
                    Overdue by{' '}
                    <span className="font-mono tabular text-vellum">{item.overdueByHours}h</span>
                  </span>
                  <span>Waiting since {formatDateTime(item.waitingSince)}</span>
                </div>

                {item.escrowId ? (
                  <Link
                    href={`/escrow/${item.escrowId}`}
                    className="mt-3 inline-block text-[13px] text-mint hover:underline"
                  >
                    Open escrow
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
