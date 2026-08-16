'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import type { KycTier, KycVerificationStatus } from '@mezzo/shared-types';
import { useAuthStore } from '../../../../lib/auth-store';
import {
  AdminKycVerificationResponse,
  listAdminKycQueue,
  overrideKycTier,
} from '../../../../lib/admin-client';
import { ApiError } from '../../../../lib/api-error';
import { formatDateTime } from '../../../../lib/format-date';
import { KYC_TIER_LABELS } from '../../../../lib/kyc-tiers';
import { Select } from '../../../../components/ui/select';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/textarea';
import { ConfirmModal } from '../../../../components/ui/confirm-modal';

const STATUS_FILTERS: (KycVerificationStatus | 'ALL')[] = [
  'ALL',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
];

const OVERRIDE_TIERS: KycTier[] = ['TIER_1', 'TIER_2', 'TIER_3'];

export default function AdminKycPage() {
  const sessionStatus = useAuthStore((state) => state.status);
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<KycVerificationStatus | 'ALL'>('ALL');
  const [target, setTarget] = useState<AdminKycVerificationResponse | null>(null);
  const [tier, setTier] = useState<KycTier>('TIER_1');
  const [reason, setReason] = useState('');

  const queueQuery = useQuery({
    queryKey: ['admin-kyc-queue', statusFilter],
    queryFn: () => listAdminKycQueue(statusFilter === 'ALL' ? undefined : statusFilter),
    enabled: sessionStatus === 'authenticated',
  });

  const overrideMutation = useMutation({
    mutationFn: () => overrideKycTier(target!.userId, { tier, reason: reason.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-kyc-queue'] });
      setTarget(null);
      setReason('');
    },
  });

  const verifications = queueQuery.data ?? [];

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
            KYC queue
          </h1>
          <p className="mt-1 text-sm text-fog">Identity verification submissions.</p>
        </div>
        <div className="w-full sm:w-56">
          <Label htmlFor="kyc-status-filter">Filter by status</Label>
          <Select
            id="kyc-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as KycVerificationStatus | 'ALL')}
          >
            {STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value === 'ALL' ? 'All statuses' : value}
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
                : 'Could not load the KYC queue.'}
            </p>
          </div>
        ) : verifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-mute">
            No verifications in this state.
          </div>
        ) : (
          <ul className="space-y-3">
            {verifications.map((verification) => (
              <li
                key={verification.id}
                className="rounded-xl border border-line-soft bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-vellum">{verification.userId}</p>
                    <p className="mt-1 font-mono text-[12px] uppercase tracking-wide text-mute">
                      {verification.status} · requested {KYC_TIER_LABELS[verification.requestedTier]}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-[13px] text-mint hover:underline"
                    onClick={() => {
                      setTarget(verification);
                      setTier(
                        verification.requestedTier === 'TIER_0' ? 'TIER_1' : verification.requestedTier,
                      );
                    }}
                  >
                    Override tier
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-mute">
                  <span>{verification.provider}</span>
                  <span className="font-mono">{verification.providerReference}</span>
                  <span>Submitted {formatDateTime(verification.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmModal
        open={target !== null}
        title="Override KYC tier"
        description="This overrides the tier for this user directly. It's written to the audit trail."
        confirmLabel="Override tier"
        loading={overrideMutation.isPending}
        confirmDisabled={reason.trim().length === 0}
        error={
          overrideMutation.error instanceof ApiError
            ? overrideMutation.error.message
            : overrideMutation.error
              ? 'Could not override this tier.'
              : null
        }
        onConfirm={() => overrideMutation.mutate()}
        onClose={() => {
          setTarget(null);
          setReason('');
        }}
      >
        <Label htmlFor="override-tier">New tier</Label>
        <Select id="override-tier" value={tier} onChange={(event) => setTier(event.target.value as KycTier)}>
          {OVERRIDE_TIERS.map((value) => (
            <option key={value} value={value}>
              {KYC_TIER_LABELS[value]}
            </option>
          ))}
        </Select>
        <div className="mt-4">
          <Label htmlFor="override-reason">Reason</Label>
          <Textarea
            id="override-reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this tier being overridden?"
          />
        </div>
      </ConfirmModal>
    </div>
  );
}
