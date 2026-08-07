import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { EscrowDetailResponse, EscrowRole } from '@mezzo/shared-types';
import { ESCROW_STATE_LABELS } from '../../lib/escrow-state-labels';
import { formatMoney } from '../../lib/money';
import { formatDateTime } from '../../lib/format-date';

const ROLE_LABELS: Record<EscrowRole, string> = {
  BUYER: 'You are buying',
  SELLER: 'You are selling',
};

interface EscrowListProps {
  escrows: EscrowDetailResponse[];
  currentUserId: string;
}

export function EscrowList({ escrows, currentUserId }: EscrowListProps) {
  return (
    <ul className="divide-y divide-line-soft rounded-xl border border-line-soft bg-surface shadow-card">
      {escrows.map((escrow) => {
        const role = escrow.parties.find((party) => party.userId === currentUserId)?.role;
        return (
          <li key={escrow.id}>
            <Link
              href={`/escrow/${escrow.id}`}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-vellum">
                  {escrow.terms?.itemDescription ?? 'Untitled escrow'}
                </p>
                <p className="mt-0.5 text-[13px] text-mute">
                  {ESCROW_STATE_LABELS[escrow.state]}
                  {role ? ` · ${ROLE_LABELS[role]}` : ''}
                  {' · '}
                  {formatDateTime(escrow.updatedAt)}
                </p>
              </div>
              {escrow.terms ? (
                <span className="shrink-0 font-mono tabular text-sm text-vellum">
                  {formatMoney(escrow.terms.price.amount, escrow.terms.price.currency)}
                </span>
              ) : null}
              <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
