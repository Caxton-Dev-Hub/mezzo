import type {
  ConfirmStellarDepositDto,
  StellarAccountResponse,
  StellarEscrowResponse,
  StellarRailConfigResponse,
} from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function getStellarRailConfig(): Promise<StellarRailConfigResponse> {
  return apiRequest<StellarRailConfigResponse>('/stellar/config', { skipAuth: true });
}

export function getStellarWallet(): Promise<StellarAccountResponse | null> {
  return apiRequest<StellarAccountResponse | null>('/stellar/wallet');
}

export function linkStellarWallet(accountId: string): Promise<StellarAccountResponse> {
  return apiRequest<StellarAccountResponse>('/stellar/wallet', {
    method: 'POST',
    body: { accountId },
  });
}

export function unlinkStellarWallet(): Promise<void> {
  return apiRequest<void>('/stellar/wallet', { method: 'DELETE' });
}

export function getStellarEscrow(escrowId: string): Promise<StellarEscrowResponse> {
  return apiRequest<StellarEscrowResponse>(`/stellar/escrows/${escrowId}`);
}

export function openStellarFunding(escrowId: string): Promise<StellarEscrowResponse> {
  return apiRequest<StellarEscrowResponse>(`/stellar/escrows/${escrowId}/fund`, {
    method: 'POST',
  });
}

export function confirmStellarDeposit(
  escrowId: string,
  dto: ConfirmStellarDepositDto,
): Promise<StellarEscrowResponse> {
  return apiRequest<StellarEscrowResponse>(`/stellar/escrows/${escrowId}/confirm`, {
    method: 'POST',
    body: dto,
  });
}
