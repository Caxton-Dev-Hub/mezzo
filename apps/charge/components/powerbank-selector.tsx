'use client';

import { useQuery } from '@tanstack/react-query';
import { getAvailablePowerbanks } from '@/lib/api-client';

interface PowerbankSelectorProps {
  shopId: string | null;
  value?: string;
  onChange: (powerbankId: string) => void;
  disabled?: boolean;
}

export function PowerbankSelector({ shopId, value, onChange, disabled }: PowerbankSelectorProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['available-powerbanks', shopId],
    queryFn: getAvailablePowerbanks,
    enabled: !!shopId,
  });

  const availablePowerbanks = shopId
    ? data?.items.filter((pb) => pb.shopId === shopId) || []
    : [];

  const isDisabled = disabled || !shopId || isLoading;

  return (
    <div>
      <label htmlFor="powerbankId" className="block text-sm font-medium mb-2">
        Powerbank
      </label>
      <select
        id="powerbankId"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={isDisabled}
        className="w-full px-4 py-3 bg-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-mint focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">
          {!shopId
            ? 'Select a shop first'
            : isLoading
              ? 'Loading...'
              : availablePowerbanks.length === 0
                ? 'No available powerbanks'
                : 'Select a powerbank'}
        </option>
        {availablePowerbanks.map((powerbank) => (
          <option key={powerbank.id} value={powerbank.id}>
            Powerbank #{powerbank.number}
          </option>
        ))}
      </select>
    </div>
  );
}
