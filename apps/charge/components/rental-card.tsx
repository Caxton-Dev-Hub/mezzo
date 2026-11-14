import Link from 'next/link';
import { Clock, MapPin } from 'lucide-react';
import { PowerbankStatus } from './powerbank-status';
import type { RentalResponse } from '@/lib/api-client';

interface RentalCardProps {
  rental: RentalResponse;
}

export function RentalCard({ rental }: RentalCardProps) {
  const dueDate = new Date(rental.dueAt);
  const now = new Date();
  const hoursRemaining = Math.max(0, Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60)));
  const isOverdue = now > dueDate && rental.status === 'ACTIVE';

  const totalAmount = parseFloat(rental.totalChargedAmount);
  const formattedTotal = totalAmount.toLocaleString('en-NG', {
    style: 'currency',
    currency: rental.totalChargedCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <Link href={`/dashboard/rentals/${rental.id}`}>
      <div className="bg-surface rounded-xl p-6 shadow-card hover:shadow-lift transition-shadow">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-medium">Powerbank {rental.powerbankId.slice(0, 8)}</h3>
              <PowerbankStatus status={rental.status} />
            </div>
            <div className="flex items-center gap-2 text-sm text-fog">
              <MapPin className="w-4 h-4" />
              <span>Shop {rental.shopId.slice(0, 8)}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-medium tabular">{formattedTotal}</div>
          </div>
        </div>

        {rental.status === 'ACTIVE' && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4" />
            {isOverdue ? (
              <span className="text-danger font-medium">Overdue</span>
            ) : (
              <span className="text-fog">
                {hoursRemaining}h remaining until due
              </span>
            )}
          </div>
        )}

        {rental.status === 'RETURNED' && rental.returnedAt && (
          <div className="text-sm text-mute">
            Returned {new Date(rental.returnedAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </Link>
  );
}
