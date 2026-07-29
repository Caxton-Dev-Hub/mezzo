import { Lock } from 'lucide-react';
import type { EscrowTermsResponse } from '@mezzo/shared-types';
import { formatMoney } from '../../lib/money';

interface TermsPanelProps {
  terms: EscrowTermsResponse;
  frozen: boolean;
}

export function TermsPanel({ terms, frozen }: TermsPanelProps) {
  return (
    <div className="rounded-xl border border-line-soft bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-vellum">Terms</h3>
        {frozen ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-fog">
            <Lock className="h-3 w-3" />
            Frozen
          </span>
        ) : null}
      </div>
      <dl className="mt-3 space-y-3 text-sm">
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
    </div>
  );
}
