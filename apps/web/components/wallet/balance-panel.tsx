import { Clock, Landmark, Lock } from 'lucide-react';
import type { WalletBalancesResponse } from '@mezzo/shared-types';
import { formatMoney } from '../../lib/money';

interface BalancePanelProps {
  balances: WalletBalancesResponse;
}

export function BalancePanel({ balances }: BalancePanelProps) {
  const cards = [
    {
      label: 'Available',
      hint: 'Yours to withdraw right now',
      icon: Landmark,
      accent: 'text-mint',
      money: balances.available,
    },
    {
      label: 'Pending',
      hint: 'On its way to your bank',
      icon: Clock,
      accent: 'text-seller',
      money: balances.pending,
    },
    {
      label: 'Held in escrow',
      hint: 'Tied up in open orders',
      icon: Lock,
      accent: 'text-buyer',
      money: balances.heldInEscrow,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map(({ label, hint, icon: Icon, accent, money }) => (
        <section
          key={label}
          aria-label={label}
          className="rounded-xl border border-line-soft bg-surface p-4"
        >
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${accent}`} />
            <h3 className="text-[13px] font-medium text-fog">{label}</h3>
          </div>
          <p className="tabular mt-3 font-mono text-[1.35rem] leading-none text-vellum">
            {formatMoney(money.amount, money.currency)}
          </p>
          <p className="mt-2 text-[13px] text-mute">{hint}</p>
        </section>
      ))}
    </div>
  );
}
