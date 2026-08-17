'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../lib/auth-store';
import {
  getPayoutAccount,
  getPayouts,
  getWalletActivity,
  getWalletBalances,
} from '../../../lib/payments-client';
import { getKycStatus } from '../../../lib/kyc-client';
import { KYC_TIER_LABELS, PAYOUT_MIN_TIER, verificationBlocks } from '../../../lib/kyc-tiers';
import { ApiError } from '../../../lib/api-error';
import { Button } from '../../../components/ui/button';
import { VerifyPrompt } from '../../../components/kyc/verify-prompt';
import { BalancePanel } from '../../../components/wallet/balance-panel';
import { ActivityList } from '../../../components/wallet/activity-list';
import { PayoutList } from '../../../components/wallet/payout-list';
import { PayoutAccountCard } from '../../../components/wallet/payout-account-card';
import { PayoutAccountModal } from '../../../components/wallet/payout-account-modal';
import { RequestPayoutModal } from '../../../components/wallet/request-payout-modal';

export default function WalletPage() {
  const sessionStatus = useAuthStore((state) => state.status);
  const enabled = sessionStatus === 'authenticated';
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAccountOpen, setPayoutAccountOpen] = useState(false);

  const balancesQuery = useQuery({
    queryKey: ['wallet-balances'],
    queryFn: getWalletBalances,
    enabled,
  });

  const activityQuery = useQuery({
    queryKey: ['wallet-activity'],
    queryFn: getWalletActivity,
    enabled,
  });

  const payoutsQuery = useQuery({ queryKey: ['payouts'], queryFn: getPayouts, enabled });

  const kycQuery = useQuery({ queryKey: ['kyc-status'], queryFn: getKycStatus, enabled });

  const payoutAccountQuery = useQuery({
    queryKey: ['payout-account'],
    queryFn: getPayoutAccount,
    enabled,
  });

  if (sessionStatus === 'pending' || balancesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
        <div className="h-28 animate-pulse rounded-xl bg-surface-2" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
      </div>
    );
  }

  if (balancesQuery.isError) {
    const message =
      balancesQuery.error instanceof ApiError
        ? balancesQuery.error.message
        : 'Could not load your wallet.';
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <ShieldAlert className="h-6 w-6 text-mute" />
        <p className="mt-3 text-sm text-vellum">{message}</p>
      </div>
    );
  }

  const balances = balancesQuery.data;
  if (!balances) {
    return null;
  }

  const kycStatus = kycQuery.data ?? null;
  const payoutAccount = payoutAccountQuery.data ?? null;
  const verified = kycStatus ? !verificationBlocks(kycStatus, PAYOUT_MIN_TIER) : false;
  const canRequestPayout = verified && payoutAccount !== null;

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
          Wallet
        </h1>
        {kycStatus ? (
          <p className="text-[13px] text-mute">{KYC_TIER_LABELS[kycStatus.tier]}</p>
        ) : null}
      </div>

      <div className="mt-6">
        <BalancePanel balances={balances} />
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium text-vellum">Withdrawals</h2>
          {canRequestPayout ? (
            <Button type="button" size="sm" onClick={() => setPayoutOpen(true)}>
              Withdraw
            </Button>
          ) : null}
        </div>

        <div className="mt-3 space-y-3">
          {kycStatus && !verified ? (
            <VerifyPrompt
              status={kycStatus}
              requiredTier={PAYOUT_MIN_TIER}
              reason="Withdrawing to a bank account needs a verified identity. Your escrow balance stays safe in the meantime."
            />
          ) : null}
          {verified ? (
            <PayoutAccountCard account={payoutAccount} onChange={() => setPayoutAccountOpen(true)} />
          ) : null}
          {payoutsQuery.isLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-surface-2" />
          ) : (
            <PayoutList payouts={payoutsQuery.data ?? []} />
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-vellum">Recent activity</h2>
        {activityQuery.isLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-surface-2" />
        ) : activityQuery.isError ? (
          <p className="text-[13px] text-mute">Could not load your recent activity.</p>
        ) : (
          <ActivityList items={activityQuery.data ?? []} />
        )}
      </section>

      {kycStatus && payoutAccount ? (
        <RequestPayoutModal
          open={payoutOpen}
          available={balances.available}
          kycStatus={kycStatus}
          payoutAccount={payoutAccount}
          onClose={() => setPayoutOpen(false)}
        />
      ) : null}

      <PayoutAccountModal open={payoutAccountOpen} onClose={() => setPayoutAccountOpen(false)} />
    </div>
  );
}
