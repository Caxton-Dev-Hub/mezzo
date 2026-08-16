'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import type { UserRole, UserStatus } from '@mezzo/shared-types';
import { useAuthStore } from '../../../../../lib/auth-store';
import { getAdminUser, updateUserRole, updateUserStatus } from '../../../../../lib/admin-client';
import { ApiError } from '../../../../../lib/api-error';
import { formatDateTime } from '../../../../../lib/format-date';
import { formatMoney } from '../../../../../lib/money';
import { KYC_TIER_LABELS } from '../../../../../lib/kyc-tiers';
import { ESCROW_STATE_LABELS } from '../../../../../lib/escrow-state-labels';
import { DISPUTE_STATE_LABELS } from '../../../../../lib/dispute-labels';
import { Select } from '../../../../../components/ui/select';
import { Label } from '../../../../../components/ui/label';
import { Textarea } from '../../../../../components/ui/textarea';
import { Button } from '../../../../../components/ui/button';
import { ConfirmModal } from '../../../../../components/ui/confirm-modal';

const ROLES: UserRole[] = ['USER', 'ARBITER', 'ADMIN'];

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const sessionStatus = useAuthStore((state) => state.status);
  const queryClient = useQueryClient();

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);
  const [roleReason, setRoleReason] = useState('');

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusReason, setStatusReason] = useState('');

  const userQuery = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => getAdminUser(userId),
    enabled: sessionStatus === 'authenticated' && Boolean(userId),
  });

  const roleMutation = useMutation({
    mutationFn: () => updateUserRole(userId, { role: pendingRole!, reason: roleReason.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user', userId] });
      setRoleModalOpen(false);
      setRoleReason('');
      setPendingRole(null);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (nextStatus: UserStatus) =>
      updateUserStatus(userId, { status: nextStatus, reason: statusReason.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user', userId] });
      setStatusModalOpen(false);
      setStatusReason('');
    },
  });

  const user = userQuery.data ?? null;
  const nextStatus: UserStatus = user?.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';

  function requestRoleChange(role: UserRole) {
    if (!user || role === user.role) {
      return;
    }
    setPendingRole(role);
    setRoleModalOpen(true);
  }

  if (userQuery.isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-surface-2" />;
  }

  if (userQuery.isError || !user) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <ShieldAlert className="h-6 w-6 text-mute" />
        <p className="mt-3 text-sm text-vellum">
          {userQuery.error instanceof ApiError ? userQuery.error.message : 'Could not load this user.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
            {user.email}
          </h1>
          <p className="mt-1 text-sm text-fog">
            Joined {formatDateTime(user.createdAt)} · {KYC_TIER_LABELS[user.kycTier]}
          </p>
        </div>
        <span
          className={
            user.status === 'SUSPENDED'
              ? 'shrink-0 rounded-full bg-danger/15 px-3 py-1 font-mono text-[12px] uppercase tracking-wide text-danger'
              : 'shrink-0 rounded-full bg-surface-2 px-3 py-1 font-mono text-[12px] uppercase tracking-wide text-mute'
          }
        >
          {user.status}
        </span>
      </div>

      <section className="mt-8 max-w-xl rounded-2xl border border-line-soft bg-surface p-5 shadow-card">
        <h2 className="text-sm font-medium text-vellum">Role &amp; access</h2>
        <div className="mt-4">
          <Label htmlFor="role-select">Role</Label>
          <Select
            id="role-select"
            value={user.role}
            onChange={(event) => requestRoleChange(event.target.value as UserRole)}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-5">
          <Button
            type="button"
            variant={user.status === 'SUSPENDED' ? 'primary' : 'secondary'}
            className={user.status === 'SUSPENDED' ? undefined : 'bg-danger text-vellum hover:bg-danger-deep'}
            onClick={() => setStatusModalOpen(true)}
          >
            {user.status === 'SUSPENDED' ? 'Reactivate account' : 'Suspend account'}
          </Button>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-vellum">Escrows ({user.escrows.length})</h2>
        {user.escrows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-mute">
            No escrows yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {user.escrows.map((escrow) => (
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
                      {ESCROW_STATE_LABELS[escrow.state]} · {escrow.role}
                    </p>
                  </div>
                  {escrow.price ? (
                    <p className="shrink-0 font-mono text-sm tabular text-vellum">
                      {formatMoney(escrow.price.amount, escrow.price.currency)}
                    </p>
                  ) : null}
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
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-vellum">Disputes ({user.disputes.length})</h2>
        {user.disputes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-mute">
            No disputes.
          </div>
        ) : (
          <ul className="space-y-3">
            {user.disputes.map((dispute) => (
              <li
                key={dispute.id}
                className="rounded-xl border border-line-soft bg-surface p-4 shadow-card"
              >
                <p className="font-mono text-[12px] uppercase tracking-wide text-mute">
                  {DISPUTE_STATE_LABELS[dispute.state]}
                </p>
                <Link
                  href={`/admin/disputes/${dispute.id}`}
                  className="mt-2 inline-block text-[13px] text-mint hover:underline"
                >
                  Open dispute
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-vellum">
          Payment intents ({user.paymentIntents.length})
        </h2>
        {user.paymentIntents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-mute">
            No funding attempts.
          </div>
        ) : (
          <ul className="space-y-3">
            {user.paymentIntents.map((intent) => (
              <li
                key={intent.id}
                className="flex items-center justify-between rounded-xl border border-line-soft bg-surface p-4 shadow-card"
              >
                <p className="font-mono text-[12px] uppercase tracking-wide text-mute">
                  {intent.status}
                </p>
                <p className="font-mono text-sm tabular text-vellum">
                  {formatMoney(intent.amount.amount, intent.amount.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-vellum">Payouts ({user.payouts.length})</h2>
        {user.payouts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-mute">
            No withdrawals.
          </div>
        ) : (
          <ul className="space-y-3">
            {user.payouts.map((payout) => (
              <li
                key={payout.id}
                className="flex items-center justify-between rounded-xl border border-line-soft bg-surface p-4 shadow-card"
              >
                <p className="font-mono text-[12px] uppercase tracking-wide text-mute">
                  {payout.status}
                </p>
                <p className="font-mono text-sm tabular text-vellum">
                  {formatMoney(payout.amount.amount, payout.amount.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={roleModalOpen}
        title={`Change role to ${pendingRole ?? ''}`}
        description="This changes what this account can access immediately. It's written to the audit trail."
        confirmLabel="Change role"
        loading={roleMutation.isPending}
        confirmDisabled={roleReason.trim().length === 0}
        error={
          roleMutation.error instanceof ApiError
            ? roleMutation.error.message
            : roleMutation.error
              ? 'Could not change this role.'
              : null
        }
        onConfirm={() => roleMutation.mutate()}
        onClose={() => {
          setRoleModalOpen(false);
          setPendingRole(null);
          setRoleReason('');
        }}
      >
        <Label htmlFor="role-reason">Reason</Label>
        <Textarea
          id="role-reason"
          rows={2}
          value={roleReason}
          onChange={(event) => setRoleReason(event.target.value)}
          placeholder="Why is this role changing?"
        />
      </ConfirmModal>

      <ConfirmModal
        open={statusModalOpen}
        title={nextStatus === 'SUSPENDED' ? 'Suspend this account' : 'Reactivate this account'}
        description={
          nextStatus === 'SUSPENDED'
            ? 'The user will be signed out and unable to log back in until reactivated. This is written to the audit trail.'
            : 'The user will be able to log in again immediately. This is written to the audit trail.'
        }
        confirmLabel={nextStatus === 'SUSPENDED' ? 'Suspend account' : 'Reactivate account'}
        destructive={nextStatus === 'SUSPENDED'}
        loading={statusMutation.isPending}
        confirmDisabled={statusReason.trim().length === 0}
        error={
          statusMutation.error instanceof ApiError
            ? statusMutation.error.message
            : statusMutation.error
              ? 'Could not change this account status.'
              : null
        }
        onConfirm={() => statusMutation.mutate(nextStatus)}
        onClose={() => {
          setStatusModalOpen(false);
          setStatusReason('');
        }}
      >
        <Label htmlFor="status-reason">Reason</Label>
        <Textarea
          id="status-reason"
          rows={2}
          value={statusReason}
          onChange={(event) => setStatusReason(event.target.value)}
          placeholder={nextStatus === 'SUSPENDED' ? 'Why are you suspending this account?' : 'Why are you reactivating this account?'}
        />
      </ConfirmModal>
    </div>
  );
}
