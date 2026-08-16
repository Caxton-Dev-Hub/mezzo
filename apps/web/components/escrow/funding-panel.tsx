'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, Lock } from 'lucide-react';
import type {
  EscrowDetailResponse,
  KycStatusResponse,
  PaymentIntentResponse,
} from '@mezzo/shared-types';
import { Button } from '../ui/button';
import { VerifyPrompt } from '../kyc/verify-prompt';
import { initiateFunding } from '../../lib/payments-client';
import { tierBlockedBy } from '../../lib/kyc-tiers';
import { formatMoney } from '../../lib/money';
import { ApiError } from '../../lib/api-error';

interface FundingPanelProps {
  escrow: EscrowDetailResponse;
  intent: PaymentIntentResponse | null;
  kycStatus: KycStatusResponse | null;
  isBuyer: boolean;
}

export function FundingPanel({ escrow, intent, kycStatus, isBuyer }: FundingPanelProps) {
  const queryClient = useQueryClient();
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const fund = useMutation({
    mutationFn: () => initiateFunding(escrow.id),
    onSuccess: (created: PaymentIntentResponse) => {
      queryClient.invalidateQueries({ queryKey: ['payment-intent', escrow.id] });
      if (created.authorizationUrl) {
        setCheckoutUrl(created.authorizationUrl);
        window.location.assign(created.authorizationUrl);
      }
    },
  });

  if (escrow.state === 'FUNDED') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-mint/30 bg-mint/5 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-mint" />
        <div>
          <p className="text-sm text-vellum">Payment confirmed</p>
          <p className="mt-1 text-[13px] text-fog">
            The money is held in escrow until you confirm the item is what you agreed.
          </p>
          <Link
            href={`/escrow/${escrow.id}`}
            className="mt-3 inline-block text-[13px] text-mint underline underline-offset-4"
          >
            Back to the escrow
          </Link>
        </div>
      </div>
    );
  }

  if (escrow.state !== 'AGREED') {
    return (
      <p className="text-[13px] text-mute">
        Funding is only available while an escrow is awaiting payment. This one is no longer at that
        stage.
      </p>
    );
  }

  if (!isBuyer) {
    return (
      <p className="text-[13px] text-mute">
        Only the buyer can fund this escrow. You&apos;ll see the state change here once the payment
        clears.
      </p>
    );
  }

  const error = fund.error;

  if (intent?.status === 'QUARANTINED') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div>
          <p className="text-sm text-vellum">This payment needs a manual check</p>
          <p className="mt-1 text-[13px] text-fog">
            A payment came back that didn&apos;t match this escrow&apos;s amount, so we&apos;ve put
            it on hold rather than funding the escrow. Reference {intent.reference}.
          </p>
        </div>
      </div>
    );
  }

  if (intent?.status === 'PENDING') {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-4">
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-fog" />
          <div>
            <p className="text-sm text-vellum">Confirming payment…</p>
            <p className="mt-1 text-[13px] text-fog">
              An escrow is only marked funded once the payment provider confirms it to us directly,
              never on the way back from checkout. This page updates itself.
            </p>
          </div>
        </div>
        {checkoutUrl ? (
          <a
            href={checkoutUrl}
            className="inline-block text-[13px] text-mint underline underline-offset-4"
          >
            Reopen the payment page
          </a>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={fund.isPending}
            onClick={() => fund.mutate()}
          >
            Reopen the payment page
          </Button>
        )}
        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error instanceof ApiError
              ? error.message
              : 'Could not reopen the payment page. Please try again.'}
          </p>
        ) : null}
      </div>
    );
  }

  const blockedTier = kycStatus ? tierBlockedBy(error, kycStatus.tier) : null;
  if (blockedTier && kycStatus) {
    return (
      <VerifyPrompt
        status={kycStatus}
        requiredTier={blockedTier}
        reason="Funding an escrow of this size needs a verified identity first."
      />
    );
  }

  return (
    <div className="space-y-3">
      <Button type="button" className="w-full" loading={fund.isPending} onClick={() => fund.mutate()}>
        <Lock className="h-4 w-4" />
        {escrow.terms
          ? `Fund ${formatMoney(escrow.terms.price.amount, escrow.terms.price.currency)}`
          : 'Fund escrow'}
      </Button>
      <p className="text-[13px] text-mute">
        Mezzo holds your money — not the seller — until you confirm delivery.
      </p>
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error instanceof ApiError
            ? error.message
            : 'Could not start the payment. Please try again.'}
        </p>
      ) : null}
    </div>
  );
}
