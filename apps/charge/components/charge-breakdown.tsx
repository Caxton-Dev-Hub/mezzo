import { formatCurrency } from '@/lib/utils';

interface ChargeBreakdownProps {
  baseAmount: string;
  totalAmount: string;
  currency: string;
}

export function ChargeBreakdown({ baseAmount, totalAmount, currency }: ChargeBreakdownProps) {
  const base = parseFloat(baseAmount);
  const total = parseFloat(totalAmount);
  const overage = total - base;

  return (
    <div className="bg-surface rounded-2xl p-8 shadow-card">
      <h2 className="text-2xl font-display mb-6">Charges</h2>
      <div className="space-y-3">
        <div className="flex justify-between pb-3 border-b border-line">
          <span className="text-fog">Base charge (24h)</span>
          <span className="font-medium tabular">{formatCurrency(base, currency)}</span>
        </div>

        {overage > 0 && (
          <div className="flex justify-between pb-3 border-b border-line">
            <span className="text-fog">Overage charges</span>
            <span className="font-medium tabular text-seller">
              {formatCurrency(overage, currency)}
            </span>
          </div>
        )}

        <div className="flex justify-between pt-3">
          <span className="font-medium text-lg">Total</span>
          <span className="font-medium text-2xl tabular">{formatCurrency(total, currency)}</span>
        </div>
      </div>

      {overage > 0 && (
        <div className="mt-6 p-4 bg-seller/5 border border-seller/20 rounded-lg text-sm text-fog">
          <p>
            Overage charges are billed at ₦25 per hour after the 24-hour period ends, capped at
            ₦600 (48 hours total).
          </p>
        </div>
      )}
    </div>
  );
}
