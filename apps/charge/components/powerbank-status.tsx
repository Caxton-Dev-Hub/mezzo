import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const statusVariants = cva(
  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
  {
    variants: {
      status: {
        ACTIVE: 'bg-mint/10 text-mint border border-mint/20',
        RETURNED: 'bg-fog/10 text-fog border border-fog/20',
        OVERDUE: 'bg-seller/10 text-seller border border-seller/20',
        UNRETURNED: 'bg-danger/10 text-danger border border-danger/20',
      },
    },
    defaultVariants: {
      status: 'ACTIVE',
    },
  }
);

interface PowerbankStatusProps {
  status: 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'UNRETURNED';
  className?: string;
}

export function PowerbankStatus({ status, className }: PowerbankStatusProps) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  
  return (
    <span className={cn(statusVariants({ status }), className)}>
      {label}
    </span>
  );
}
