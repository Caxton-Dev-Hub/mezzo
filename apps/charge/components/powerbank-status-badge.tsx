import { PowerbankStatus } from '@mezzo/shared-types';

interface PowerbankStatusBadgeProps {
  status: PowerbankStatus;
}

export function PowerbankStatusBadge({ status }: PowerbankStatusBadgeProps) {
  const styles = {
    [PowerbankStatus.AVAILABLE]: 'bg-mint/10 text-mint border-mint/20',
    [PowerbankStatus.RENTED]: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    [PowerbankStatus.OVERDUE]: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    [PowerbankStatus.MAINTENANCE]: 'bg-fog/10 text-fog border-fog/20',
    [PowerbankStatus.UNRETURNED]: 'bg-danger/10 text-danger border-danger/20',
    [PowerbankStatus.LOST]: 'bg-danger/10 text-danger border-danger/20',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${styles[status]}`}
    >
      {status}
    </span>
  );
}
