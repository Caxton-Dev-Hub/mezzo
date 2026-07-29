import { LatestPaymentIntentResponse, PaymentIntentResponse } from '@mezzo/shared-types';
import { PaymentIntent } from '../../database/entities/payment-intent.entity';

export type { LatestPaymentIntentResponse, PaymentIntentResponse };

export function toPaymentIntentResponse(
  intent: PaymentIntent,
  authorizationUrl: string | null = null,
): PaymentIntentResponse {
  return {
    id: intent.id,
    escrowId: intent.escrowId,
    amount: intent.amount,
    currency: intent.currency,
    status: intent.status,
    reference: intent.providerReference,
    authorizationUrl,
  };
}
