import { Money } from '../common/money/money';

export interface FeeSplit {
  feeAmount: Money;
  netAmount: Money;
}

export function computeFeeSplit(gross: Money, feeBps: number): FeeSplit {
  const feeAmount = Money.of(Math.floor((gross.amount * feeBps) / 10_000), gross.currency);
  const netAmount = gross.subtract(feeAmount);
  return { feeAmount, netAmount };
}
