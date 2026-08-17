'use client';

import { Landmark } from 'lucide-react';
import type { PayoutAccountResponse } from '@mezzo/shared-types';
import { Button } from '../ui/button';

interface PayoutAccountCardProps {
  account: PayoutAccountResponse | null;
  onChange: () => void;
}

function maskAccountNumber(accountNumber: string): string {
  return `•••• ${accountNumber.slice(-4)}`;
}

export function PayoutAccountCard({ account, onChange }: PayoutAccountCardProps) {
  if (!account) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Landmark className="h-5 w-5 text-mute" />
          <p className="text-sm text-fog">Add a payout account to withdraw to your bank.</p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={onChange}>
          Add payout account
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Landmark className="h-5 w-5 text-mute" />
        <div>
          <p className="text-sm text-vellum">
            {account.bankName} {maskAccountNumber(account.accountNumber)}
          </p>
          <p className="text-[13px] text-mute">{account.accountName}</p>
        </div>
      </div>
      <Button type="button" size="sm" variant="secondary" onClick={onChange}>
        Change
      </Button>
    </div>
  );
}
