'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import type {
  AdminPaymentIntentResponse,
  AdminPayoutResponse,
  PaymentIntentStatus,
  PayoutStatus,
} from '@mezzo/shared-types';
import { useAuthStore } from '../../../../lib/auth-store';
import {
  listAdminPaymentIntents,
  listAdminPayouts,
  resolvePaymentIntentQuarantine,
  retryPayout,
} from '../../../../lib/admin-client';
import { ApiError } from '../../../../lib/api-error';
import { formatDateTime } from '../../../../lib/format-date';
import { formatMoney } from '../../../../lib/money';
import { Label } from '../../../../components/ui/label';
import { Select } from '../../../../components/ui/select';
import { Textarea } from '../../../../components/ui/textarea';
import { ConfirmModal } from '../../../../components/ui/confirm-modal';

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

const PAYOUT_STATUS_FILTERS: (PayoutStatus | 'ALL')[] = ['ALL', 'PENDING', 'CONFIRMED', 'FAILED'];
const INTENT_STATUS_FILTERS: (PaymentIntentStatus | 'ALL')[] = [
  'ALL',
  'PENDING',
  'FUNDED',
  'QUARANTINED',
];

export default function AdminPaymentsPage() {
  const sessionStatus = useAuthStore((state) => state.status);
  const enabled = sessionStatus === 'authenticated';
  const queryClient = useQueryClient();

  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus | 'ALL'>('ALL');
  const [intentStatus, setIntentStatus] = useState<PaymentIntentStatus | 'ALL'>('ALL');

  const [retryTarget, setRetryTarget] = useState<AdminPayoutResponse | null>(null);
  const [retryReason, setRetryReason] = useState('');

  const [quarantineTarget, setQuarantineTarget] = useState<AdminPaymentIntentResponse | null>(null);
  const [quarantineReason, setQuarantineReason] = useState('');

  const payoutsQuery = useQuery({
    queryKey: ['admin-payouts', payoutStatus],
    queryFn: () => listAdminPayouts(payoutStatus === 'ALL' ? undefined : payoutStatus),
    enabled,
  });

  const intentsQuery = useQuery({
    queryKey: ['admin-payment-intents', intentStatus],
    queryFn: () => listAdminPaymentIntents(intentStatus === 'ALL' ? undefined : intentStatus),
    enabled,
  });

  const retryMutation = useMutation({
    mutationFn: () => retryPayout(retryTarget!.id, { reason: retryReason.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      setRetryTarget(null);
      setRetryReason('');
    },
  });

  const quarantineMutation = useMutation({
    mutationFn: () =>
      resolvePaymentIntentQuarantine(quarantineTarget!.id, { reason: quarantineReason.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payment-intents'] });
      setQuarantineTarget(null);
      setQuarantineReason('');
    },
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
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-medium text-vellum">Withdrawals</h2>
          <div className="w-48">
            <Label htmlFor="payout-status-filter">Filter by status</Label>
            <Select
              id="payout-status-filter"
              value={payoutStatus}
              onChange={(event) => setPayoutStatus(event.target.value as PayoutStatus | 'ALL')}
            >
              {PAYOUT_STATUS_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {value === 'ALL' ? 'All statuses' : value}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {payoutsQuery.isLoading ? (
          <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
        ) : payoutsQuery.isError ? (
          <ErrorPanel error={payoutsQuery.error} fallback="Could not load withdrawals." />
        ) : payouts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-mute">
            No withdrawals in this state.
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
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-mute">
                  <span>{payout.provider}</span>
                  <span className="font-mono">{payout.reference}</span>
                  <span>Requested {formatDateTime(payout.createdAt)}</span>
                  {payout.status === 'FAILED' ? (
                    <button
                      type="button"
                      className="text-[13px] text-mint hover:underline"
                      onClick={() => setRetryTarget(payout)}
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-medium text-vellum">Funding attempts</h2>
          <div className="w-48">
            <Label htmlFor="intent-status-filter">Filter by status</Label>
            <Select
              id="intent-status-filter"
              value={intentStatus}
              onChange={(event) => setIntentStatus(event.target.value as PaymentIntentStatus | 'ALL')}
            >
              {INTENT_STATUS_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {value === 'ALL' ? 'All statuses' : value}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {intentsQuery.isLoading ? (
          <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
        ) : intentsQuery.isError ? (
          <ErrorPanel error={intentsQuery.error} fallback="Could not load funding attempts." />
        ) : intents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-mute">
            No funding attempts in this state.
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
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-mute">
                  <span>{intent.provider}</span>
                  <span className="font-mono">{intent.reference}</span>
                  <span>Started {formatDateTime(intent.createdAt)}</span>
                  {intent.status === 'QUARANTINED' ? (
                    <button
                      type="button"
                      className="text-[13px] text-mint hover:underline"
                      onClick={() => setQuarantineTarget(intent)}
                    >
                      Resolve quarantine
                    </button>
                  ) : null}
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

      <ConfirmModal
        open={retryTarget !== null}
        title="Retry this withdrawal"
        description="Re-attempts the transfer with the same seller, amount, and bank details. This is written to the audit trail."
        confirmLabel="Retry withdrawal"
        loading={retryMutation.isPending}
        confirmDisabled={retryReason.trim().length === 0}
        error={
          retryMutation.error instanceof ApiError
            ? retryMutation.error.message
            : retryMutation.error
              ? 'Could not retry this withdrawal.'
              : null
        }
        onConfirm={() => retryMutation.mutate()}
        onClose={() => {
          setRetryTarget(null);
          setRetryReason('');
        }}
      >
        <Label htmlFor="retry-reason">Reason</Label>
        <Textarea
          id="retry-reason"
          rows={2}
          value={retryReason}
          onChange={(event) => setRetryReason(event.target.value)}
          placeholder="Why is this withdrawal being retried?"
        />
      </ConfirmModal>

      <ConfirmModal
        open={quarantineTarget !== null}
        title="Resolve this quarantine"
        description="Moves the funding attempt back to pending so it can be reprocessed. This does not move any money — post a ledger adjustment separately if a correction is needed. Written to the audit trail."
        confirmLabel="Resolve quarantine"
        loading={quarantineMutation.isPending}
        confirmDisabled={quarantineReason.trim().length === 0}
        error={
          quarantineMutation.error instanceof ApiError
            ? quarantineMutation.error.message
            : quarantineMutation.error
              ? 'Could not resolve this quarantine.'
              : null
        }
        onConfirm={() => quarantineMutation.mutate()}
        onClose={() => {
          setQuarantineTarget(null);
          setQuarantineReason('');
        }}
      >
        <Label htmlFor="quarantine-reason">Reason</Label>
        <Textarea
          id="quarantine-reason"
          rows={2}
          value={quarantineReason}
          onChange={(event) => setQuarantineReason(event.target.value)}
          placeholder="Why is this quarantine being resolved?"
        />
      </ConfirmModal>
    </div>
  );
}
