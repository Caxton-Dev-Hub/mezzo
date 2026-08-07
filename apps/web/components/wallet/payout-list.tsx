import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { PayoutResponse, PayoutStatus } from '@mezzo/shared-types';
import { formatMoney } from '../../lib/money';
import { formatDateTime } from '../../lib/format-date';

const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  PENDING: 'Pending confirmation',
  CONFIRMED: 'Paid out',
  FAILED: 'Failed — returned to your wallet',
};

const PAYOUT_STATUS_STYLES: Record<PayoutStatus, string> = {
  PENDING: 'text-seller',
  CONFIRMED: 'text-mint',
  FAILED: 'text-danger',
};

const PAYOUT_STATUS_ICONS: Record<PayoutStatus, typeof Clock> = {
  PENDING: Clock,
  CONFIRMED: CheckCircle2,
  FAILED: XCircle,
};

interface PayoutListProps {
  payouts: PayoutResponse[];
}

export function PayoutList({ payouts }: PayoutListProps) {
  if (payouts.length === 0) {
    return <p className="text-[13px] text-mute">No withdrawals yet.</p>;
  }

  return (
    <ul className="divide-y divide-line-soft rounded-xl border border-line-soft bg-surface shadow-card">
      {payouts.map((payout) => {
        const Icon = PAYOUT_STATUS_ICONS[payout.status];
        return (
          <li key={payout.id} className="flex items-center gap-3 px-4 py-3">
            <Icon className={`h-4 w-4 shrink-0 ${PAYOUT_STATUS_STYLES[payout.status]}`} />
            <div className="min-w-0 flex-1">
              <p className="tabular text-sm text-vellum">
                {formatMoney(payout.amount, payout.currency)}
              </p>
              <p className="text-[13px] text-mute">{formatDateTime(payout.createdAt)}</p>
            </div>
            <p className={`shrink-0 text-[13px] ${PAYOUT_STATUS_STYLES[payout.status]}`}>
              {PAYOUT_STATUS_LABELS[payout.status]}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
