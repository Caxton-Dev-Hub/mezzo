import { Payout } from '../../database/entities/payout.entity';
import { PayoutStatus } from '../entities/payout-status.enum';
import { Currency } from '../../common/money/currency';

export interface PayoutResponse {
  id: string;
  sellerId: string;
  amount: number;
  currency: Currency;
  status: PayoutStatus;
  reference: string;
}

export function toPayoutResponse(payout: Payout): PayoutResponse {
  return {
    id: payout.id,
    sellerId: payout.sellerId,
    amount: payout.amount,
    currency: payout.currency,
    status: payout.status,
    reference: payout.providerReference,
  };
}
