import { majorToMinorUnits } from '../common/money/minor-units';
import { PaymentProviderName } from './providers/payment-provider.interface';
import { FlutterwaveWebhookDto, PaystackWebhookDto } from './dto/payments.schemas';

export type PaymentWebhookKind = 'charge' | 'transfer' | 'other';

export interface PaymentWebhookEventInput {
  provider: PaymentProviderName;
  eventId: string;
  kind: PaymentWebhookKind;
  reference: string;
  amount: number | null;
  currency: string;
  succeeded: boolean;
}

export function normalizePaystackWebhook(dto: PaystackWebhookDto): PaymentWebhookEventInput {
  const kind: PaymentWebhookKind = dto.event.startsWith('transfer.')
    ? 'transfer'
    : dto.event === 'charge.success'
      ? 'charge'
      : 'other';

  return {
    provider: 'paystack',
    eventId: String(dto.data.id),
    kind,
    reference: dto.data.reference,
    amount: dto.data.amount,
    currency: dto.data.currency,
    succeeded: kind === 'charge' || dto.data.status === 'success',
  };
}

export function normalizeFlutterwaveWebhook(dto: FlutterwaveWebhookDto): PaymentWebhookEventInput {
  const kind: PaymentWebhookKind = dto.event.startsWith('transfer.')
    ? 'transfer'
    : dto.event === 'charge.completed'
      ? 'charge'
      : 'other';

  const reference =
    kind === 'transfer'
      ? (dto.data.reference ?? dto.data.tx_ref ?? '')
      : (dto.data.tx_ref ?? dto.data.reference ?? '');

  return {
    provider: 'flutterwave',
    eventId: String(dto.data.id),
    kind,
    reference,
    amount: majorToMinorUnits(String(dto.data.amount)),
    currency: dto.data.currency,
    succeeded: dto.data.status.toLowerCase() === 'successful',
  };
}
