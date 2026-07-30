'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ArbitrationRecordResponse,
  DisputeResolutionOutcome,
  EscrowTermsResponse,
} from '@mezzo/shared-types';
import { computeResolutionSplit } from '@mezzo/shared-types';
import { DISPUTE_OUTCOME_LABELS } from '../../lib/dispute-labels';
import { resolveDispute } from '../../lib/dispute-client';
import { formatMoney } from '../../lib/money';
import { ApiError } from '../../lib/api-error';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ConfirmModal } from '../ui/confirm-modal';

const OUTCOMES: DisputeResolutionOutcome[] = ['RELEASE_TO_SELLER', 'REFUND_TO_BUYER', 'SPLIT'];

interface ResolutionFormProps {
  disputeId: string;
  terms: EscrowTermsResponse;
  record: ArbitrationRecordResponse | null;
}

export function ResolutionForm({ disputeId, terms, record }: ResolutionFormProps) {
  const queryClient = useQueryClient();
  const prefilled = record?.status === 'RECOMMENDED' ? record.recommendedOutcome : null;
  const [outcome, setOutcome] = useState<DisputeResolutionOutcome | null>(prefilled);
  const [splitSellerBps, setSplitSellerBps] = useState(
    record?.status === 'RECOMMENDED' && record.splitRatio !== null ? String(record.splitRatio) : '5000',
  );
  const [confirming, setConfirming] = useState(false);

  const parsedBps = Number(splitSellerBps);
  const bpsValid = Number.isInteger(parsedBps) && parsedBps >= 1 && parsedBps <= 9_999;
  const splitBps = outcome === 'SPLIT' ? (bpsValid ? parsedBps : undefined) : undefined;
  const canExecute = outcome !== null && (outcome !== 'SPLIT' || bpsValid);

  const preview = outcome
    ? computeResolutionSplit(terms.price.amount, terms.feeBps, outcome, splitBps ?? 0)
    : null;

  const mutation = useMutation({
    mutationFn: () =>
      resolveDispute(disputeId, {
        outcome: outcome as DisputeResolutionOutcome,
        ...(splitBps !== undefined ? { splitSellerBps: splitBps } : {}),
        ...(record ? { arbitrationRecordId: record.id } : {}),
      }),
    onSuccess: () => {
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ['admin-dispute', disputeId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-disputes'] });
      void queryClient.invalidateQueries({ queryKey: ['audit', 'dispute', disputeId] });
    },
  });

  return (
    <section
      aria-label="Execute resolution"
      className="rounded-xl border border-line-soft bg-surface p-4"
    >
      <h2 className="text-sm font-medium text-vellum">Execute resolution</h2>
      <p className="mt-1 text-[13px] text-mute">
        This moves money. It is yours to decide — the AI cannot execute anything.
      </p>

      <fieldset className="mt-4">
        <legend className="sr-only">Outcome</legend>
        <div className="space-y-2">
          {OUTCOMES.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line-soft px-3 py-2.5 text-sm text-vellum hover:border-line"
            >
              <input
                type="radio"
                name="outcome"
                value={value}
                checked={outcome === value}
                onChange={() => setOutcome(value)}
                className="accent-mint"
              />
              {DISPUTE_OUTCOME_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      {outcome === 'SPLIT' ? (
        <div className="mt-4">
          <Label htmlFor="split-seller-bps">Seller share (basis points)</Label>
          <Input
            id="split-seller-bps"
            inputMode="numeric"
            value={splitSellerBps}
            onChange={(event) => setSplitSellerBps(event.target.value)}
          />
          <p className="mt-1 text-[13px] text-mute">
            {bpsValid ? (
              <span className="font-mono tabular">{(parsedBps / 100).toFixed(2)}%</span>
            ) : (
              'Enter a whole number between 1 and 9999.'
            )}{' '}
            of the held amount goes to the seller before fees.
          </p>
        </div>
      ) : null}

      {preview ? (
        <div className="mt-4 rounded-lg border border-line-soft bg-surface-2 p-3">
          <h3 className="text-[13px] font-medium text-vellum">Resulting ledger effect</h3>
          <dl className="mt-2 space-y-1.5 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-fog">DR escrow holding</dt>
              <dd className="font-mono tabular text-vellum">
                {formatMoney(terms.price.amount, terms.price.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fog">CR seller wallet</dt>
              <dd className="font-mono tabular text-vellum">
                {formatMoney(preview.sellerAmount, terms.price.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fog">CR platform fee revenue</dt>
              <dd className="font-mono tabular text-vellum">
                {formatMoney(preview.feeAmount, terms.price.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fog">CR buyer wallet</dt>
              <dd className="font-mono tabular text-vellum">
                {formatMoney(preview.buyerAmount, terms.price.currency)}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-mute">Choose an outcome to see its ledger effect.</p>
      )}

      <Button
        type="button"
        className="mt-4 w-full"
        disabled={!canExecute}
        onClick={() => setConfirming(true)}
      >
        Review and execute
      </Button>

      {mutation.error ? (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'Could not execute the resolution.'}
        </p>
      ) : null}

      <ConfirmModal
        open={confirming}
        title="Execute this resolution?"
        description="This posts to the ledger and settles the escrow. It cannot be undone — only reversed with a compensating posting."
        confirmLabel="Execute resolution"
        destructive
        loading={mutation.isPending}
        error={
          mutation.error instanceof ApiError
            ? mutation.error.message
            : mutation.error
              ? 'Could not execute the resolution.'
              : null
        }
        onConfirm={() => mutation.mutate()}
        onClose={() => setConfirming(false)}
      >
        {outcome && preview ? (
          <dl className="space-y-1.5 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-fog">Outcome</dt>
              <dd className="text-vellum">{DISPUTE_OUTCOME_LABELS[outcome]}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fog">Seller receives</dt>
              <dd className="font-mono tabular text-vellum">
                {formatMoney(preview.sellerAmount, terms.price.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fog">Buyer is refunded</dt>
              <dd className="font-mono tabular text-vellum">
                {formatMoney(preview.buyerAmount, terms.price.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fog">Platform fee</dt>
              <dd className="font-mono tabular text-vellum">
                {formatMoney(preview.feeAmount, terms.price.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fog">Arbitration record</dt>
              <dd className="font-mono text-[11px] text-vellum">{record ? record.id : 'none'}</dd>
            </div>
          </dl>
        ) : null}
      </ConfirmModal>
    </section>
  );
}
