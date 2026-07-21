import { PaymentIntent } from '../../database/entities/payment-intent.entity';
import { PaymentIntentStatus } from '../entities/payment-intent-status.enum';
import { Currency } from '../../common/money/currency';

export interface PaymentIntentResponse {
  id: string;
  escrowId: string;
  amount: number;
  currency: Currency;
  status: PaymentIntentStatus;
  reference: string;
  authorizationUrl: string | null;
}

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
