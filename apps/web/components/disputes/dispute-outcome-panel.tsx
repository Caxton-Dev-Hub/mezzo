import type { DisputeResponse, EscrowRole } from '@mezzo/shared-types';
import { Scale } from 'lucide-react';
import { DISPUTE_OUTCOME_LABELS } from '../../lib/dispute-labels';
import { formatMoney } from '../../lib/money';
import { formatDateTime } from '../../lib/format-date';

interface DisputeOutcomePanelProps {
  dispute: DisputeResponse;
  viewerRole: EscrowRole | null;
}

export function DisputeOutcomePanel({ dispute, viewerRole }: DisputeOutcomePanelProps) {
  if (!dispute.resolvedOutcome || !dispute.resolvedCurrency) {
    return null;
  }

  const currency = dispute.resolvedCurrency;
  const sellerAmount = dispute.resolvedSellerAmount ?? 0;
  const buyerAmount = dispute.resolvedBuyerAmount ?? 0;
  const feeAmount = dispute.resolvedFeeAmount ?? 0;
  const yourAmount = viewerRole === 'BUYER' ? buyerAmount : viewerRole === 'SELLER' ? sellerAmount : null;

  return (
    <section
      aria-label="Dispute outcome"
      className="rounded-xl border border-line-soft bg-surface shadow-card p-4"
    >
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-mint" />
        <h2 className="text-sm font-medium text-vellum">
          {DISPUTE_OUTCOME_LABELS[dispute.resolvedOutcome]}
        </h2>
      </div>

      {dispute.resolvedAt ? (
        <p className="mt-1 text-[13px] text-mute">Resolved {formatDateTime(dispute.resolvedAt)}</p>
      ) : null}

      {yourAmount !== null ? (
        <p className="mt-4 text-sm text-vellum">
          Credited to your wallet:{' '}
          <span className="font-mono tabular text-mint">{formatMoney(yourAmount, currency)}</span>
        </p>
      ) : null}

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-fog">To the seller</dt>
          <dd className="font-mono tabular text-vellum">{formatMoney(sellerAmount, currency)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Refunded to the buyer</dt>
          <dd className="font-mono tabular text-vellum">{formatMoney(buyerAmount, currency)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Platform fee</dt>
          <dd className="font-mono tabular text-fog">{formatMoney(feeAmount, currency)}</dd>
        </div>
      </dl>
    </section>
  );
}
