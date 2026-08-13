'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../../lib/auth-store';
import { listAdminPaymentIntents, listAdminPayouts } from '../../../../lib/admin-client';
import { ApiError } from '../../../../lib/api-error';
import { formatDateTime } from '../../../../lib/format-date';
import { formatMoney } from '../../../../lib/money';

function ErrorPanel({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <ShieldAlert className="h-6 w-6 text-mute" />
      <p className="mt-3 text-sm text-vellum">
        {error instanceof ApiError ? error.message : fallback}
      </p>
    </div>
  );
}

export default function AdminPaymentsPage() {
  const sessionStatus = useAuthStore((state) => state.status);
  const enabled = sessionStatus === 'authenticated';

  const payoutsQuery = useQuery({
    queryKey: ['admin-payouts'],
    queryFn: () => listAdminPayouts(),
    enabled,
  });

  const intentsQuery = useQuery({
    queryKey: ['admin-payment-intents'],
    queryFn: () => listAdminPaymentIntents(),
    enabled,
  });

  const payouts = payoutsQuery.data ?? [];
  const intents = intentsQuery.data ?? [];

  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Money movement
      </h1>
      <p className="mt-1 text-sm text-fog">
        Every withdrawal and every funding attempt, newest first.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-vellum">Withdrawals</h2>
        {payoutsQuery.isLoading ? (
          <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
        ) : payoutsQuery.isError ? (
          <ErrorPanel error={payoutsQuery.error} fallback="Could not load withdrawals." />
        ) : payouts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-mute">
            No withdrawals yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {payouts.map((payout) => (
              <li
                key={payout.id}
                className="rounded-xl border border-line-soft bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-vellum">{payout.sellerEmail}</p>
                    <p className="mt-1 font-mono text-[12px] uppercase tracking-wide text-mute">
                      {payout.status}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm tabular text-vellum">
                    {formatMoney(payout.amount.amount, payout.amount.currency)}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-mute">
                  <span>{payout.provider}</span>
                  <span className="font-mono">{payout.reference}</span>
                  <span>Requested {formatDateTime(payout.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-vellum">Funding attempts</h2>
        {intentsQuery.isLoading ? (
          <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
        ) : intentsQuery.isError ? (
          <ErrorPanel error={intentsQuery.error} fallback="Could not load funding attempts." />
        ) : intents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-mute">
            No funding attempts yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {intents.map((intent) => (
              <li
                key={intent.id}
                className="rounded-xl border border-line-soft bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-vellum">{intent.buyerEmail}</p>
                    <p className="mt-1 font-mono text-[12px] uppercase tracking-wide text-mute">
                      {intent.status}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm tabular text-vellum">
                    {formatMoney(intent.amount.amount, intent.amount.currency)}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-mute">
                  <span>{intent.provider}</span>
                  <span className="font-mono">{intent.reference}</span>
                  <span>Started {formatDateTime(intent.createdAt)}</span>
                </div>
                <Link
                  href={`/escrow/${intent.escrowId}`}
                  className="mt-3 inline-block text-[13px] text-mint hover:underline"
                >
                  Open escrow
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
