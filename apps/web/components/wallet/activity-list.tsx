import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { WalletActivityKind, WalletActivityResponse } from '@mezzo/shared-types';
import { formatMoney } from '../../lib/money';
import { formatDateTime } from '../../lib/format-date';

const ACTIVITY_LABELS: Record<WalletActivityKind, string> = {
  ESCROW_FUNDING: 'Funded an escrow',
  ESCROW_RELEASE: 'Received a release from escrow',
  ESCROW_REFUND: 'Refunded from escrow',
  DISPUTE_RESOLUTION: 'Dispute resolution settlement',
  PAYOUT: 'Payout to your bank',
  PAYOUT_REVERSAL: 'Payout returned to your wallet',
  OTHER: 'Wallet adjustment',
};

interface ActivityListProps {
  items: WalletActivityResponse[];
}

export function ActivityList({ items }: ActivityListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
        <p className="text-sm text-fog">No money has moved yet</p>
        <p className="mt-1.5 text-[13px] text-mute">
          Funding an escrow or receiving a release will show up here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line-soft rounded-xl border border-line-soft bg-surface">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 px-4 py-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              item.direction === 'IN' ? 'bg-mint/10 text-mint' : 'bg-surface-2 text-fog'
            }`}
          >
            {item.direction === 'IN' ? (
              <ArrowDownLeft className="h-4 w-4" />
            ) : (
              <ArrowUpRight className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-vellum">{ACTIVITY_LABELS[item.kind]}</p>
            <p className="text-[13px] text-mute">
              {formatDateTime(item.occurredAt)}
              {item.escrowId ? (
                <>
                  {' · '}
                  <Link
                    href={`/escrow/${item.escrowId}`}
                    className="underline underline-offset-4 hover:text-fog"
                  >
                    View escrow
                  </Link>
                </>
              ) : null}
            </p>
          </div>
          <p
            className={`tabular shrink-0 text-sm ${
              item.direction === 'IN' ? 'text-mint' : 'text-vellum'
            }`}
          >
            {item.direction === 'IN' ? '+' : '−'}
            {formatMoney(item.amount.amount, item.amount.currency)}
          </p>
        </li>
      ))}
    </ul>
  );
}
