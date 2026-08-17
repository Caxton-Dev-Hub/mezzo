import type {
  Bank,
  LatestPaymentIntentResponse,
  PaymentIntentResponse,
  PayoutAccountInput,
  PayoutAccountResponse,
  PayoutResponse,
  RequestPayoutDto,
  VerifyPayoutAccountResponse,
  WalletActivityResponse,
  WalletBalancesResponse,
} from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function initiateFunding(escrowId: string): Promise<PaymentIntentResponse> {
  return apiRequest<PaymentIntentResponse>(`/payments/escrows/${escrowId}/fund`, {
    method: 'POST',
  });
}

export function getLatestPaymentIntent(escrowId: string): Promise<LatestPaymentIntentResponse> {
  return apiRequest<LatestPaymentIntentResponse>(`/payments/escrows/${escrowId}/intent`);
}

export function getWalletBalances(): Promise<WalletBalancesResponse> {
  return apiRequest<WalletBalancesResponse>('/wallet');
}

export function getWalletActivity(): Promise<WalletActivityResponse[]> {
  return apiRequest<WalletActivityResponse[]>('/wallet/activity');
}

export function getPayouts(): Promise<PayoutResponse[]> {
  return apiRequest<PayoutResponse[]>('/payouts');
}

export function requestPayout(dto: RequestPayoutDto): Promise<PayoutResponse> {
  return apiRequest<PayoutResponse>('/payouts', { method: 'POST', body: dto });
}

export function getPayoutBanks(): Promise<Bank[]> {
  return apiRequest<Bank[]>('/payouts/banks');
}

export function verifyPayoutAccount(
  dto: PayoutAccountInput,
): Promise<VerifyPayoutAccountResponse> {
  return apiRequest<VerifyPayoutAccountResponse>('/payouts/verify-account', {
    method: 'POST',
    body: dto,
  });
}

export function getPayoutAccount(): Promise<PayoutAccountResponse | null> {
  return apiRequest<PayoutAccountResponse | null>('/payouts/account');
}

export function savePayoutAccount(dto: PayoutAccountInput): Promise<PayoutAccountResponse> {
  return apiRequest<PayoutAccountResponse>('/payouts/account', { method: 'PUT', body: dto });
}
