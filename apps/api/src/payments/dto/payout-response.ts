import { PayoutResponse } from '@mezzo/shared-types';
import { Payout } from '../../database/entities/payout.entity';

export type { PayoutResponse };

export function toPayoutResponse(payout: Payout): PayoutResponse {
  return {
    id: payout.id,
    sellerId: payout.sellerId,
    amount: payout.amount,
    currency: payout.currency,
    status: payout.status,
    reference: payout.providerReference,
    createdAt: payout.createdAt,
  };
}
