'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Copy, Share2, TriangleAlert } from 'lucide-react';
import { useEscrowWizardStore } from '../../../lib/escrow-wizard-store';
import { getEvidenceBundle } from '../../../lib/evidence-client';
import { inviteToEscrow } from '../../../lib/escrow-client';
import { formatMoney } from '../../../lib/money';
import { ApiError } from '../../../lib/api-error';
import { Button } from '../../ui/button';

export function StepReview() {
  const escrow = useEscrowWizardStore((state) => state.escrow);
  const invite = useEscrowWizardStore((state) => state.invite);
  const setInvite = useEscrowWizardStore((state) => state.setInvite);
  const [copied, setCopied] = useState(false);

  const evidenceQuery = useQuery({
    queryKey: ['evidence', escrow?.id],
    queryFn: () => getEvidenceBundle(escrow!.id),
    enabled: Boolean(escrow),
  });

  const mutation = useMutation({
    mutationFn: () => inviteToEscrow(escrow!.id),
    onSuccess: (result) => setInvite(result),
  });

  if (!escrow || !escrow.terms) {
    return null;
  }

  const terms = escrow.terms;
  const inviteUrl = invite
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${invite.token}`
    : null;

  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!inviteUrl || !navigator.share) return;
    await navigator.share({ title: 'Join my Mezzo escrow', url: inviteUrl });
  };

  const flaggedCount =
    evidenceQuery.data?.items.filter((item) => item.flags.length > 0).length ?? 0;

  return (
    <div>
      <dl className="space-y-3 rounded-xl border border-line-soft bg-surface p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Item</dt>
          <dd className="text-right text-vellum">{terms.itemDescription}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Price</dt>
          <dd className="text-vellum">{formatMoney(terms.price.amount, terms.price.currency)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Delivery</dt>
          <dd className="text-right text-vellum">{terms.deliveryMethod}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Inspection window</dt>
          <dd className="text-vellum">{terms.inspectionWindowHours}h</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Platform fee</dt>
          <dd className="text-vellum">{(terms.feeBps / 100).toFixed(2)}%</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-line-soft bg-surface p-4 text-sm">
        <span className="text-fog">Evidence</span>
        <span className="text-vellum">
          {evidenceQuery.isLoading
            ? 'Loading…'
            : `${evidenceQuery.data?.items.length ?? 0} photo${evidenceQuery.data?.items.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {flaggedCount > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-seller">
          <TriangleAlert className="h-3.5 w-3.5" />
          {flaggedCount} item{flaggedCount === 1 ? '' : 's'} flagged for review (e.g. missing capture
          metadata).
        </p>
      ) : null}

      {invite ? (
        <div className="mt-6 rounded-xl border border-mint/30 bg-mint/10 p-4">
          <p className="text-sm text-vellum">Invite link — share it with the other party.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={inviteUrl ?? ''}
              className="h-11 flex-1 truncate rounded-lg border border-line bg-surface px-3 text-[13px] text-vellum"
            />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={handleCopy} className="gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              {typeof navigator !== 'undefined' && 'share' in navigator ? (
                <Button type="button" variant="secondary" size="sm" onClick={handleShare} className="gap-1.5">
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <>
          {mutation.error ? (
            <p role="alert" className="mt-4 text-[13px] text-danger">
              {mutation.error instanceof ApiError
                ? mutation.error.message
                : 'Could not create the invite. Please try again.'}
            </p>
          ) : null}
          <Button
            type="button"
            className="mt-6 w-full"
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Invite counterparty
          </Button>
        </>
      )}
    </div>
  );
}
