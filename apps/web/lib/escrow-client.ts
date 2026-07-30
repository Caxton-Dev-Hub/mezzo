import type {
  CreateEscrowDto,
  EscrowDetailResponse,
  EscrowEventResponse,
  EscrowTermsResponse,
  InviteResponse,
  UpdateEscrowTermsDto,
} from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function createEscrow(dto: CreateEscrowDto): Promise<EscrowDetailResponse> {
  return apiRequest<EscrowDetailResponse>('/escrows', { method: 'POST', body: dto });
}

export function listEscrows(): Promise<EscrowDetailResponse[]> {
  return apiRequest<EscrowDetailResponse[]>('/escrows');
}

export function getEscrow(escrowId: string): Promise<EscrowDetailResponse> {
  return apiRequest<EscrowDetailResponse>(`/escrows/${escrowId}`);
}

export function getEscrowEvents(escrowId: string): Promise<EscrowEventResponse[]> {
  return apiRequest<EscrowEventResponse[]>(`/escrows/${escrowId}/events`);
}

export function updateEscrowTerms(
  escrowId: string,
  dto: UpdateEscrowTermsDto,
): Promise<EscrowTermsResponse> {
  return apiRequest<EscrowTermsResponse>(`/escrows/${escrowId}/terms`, {
    method: 'PATCH',
    body: dto,
  });
}

export function inviteToEscrow(escrowId: string): Promise<InviteResponse> {
  return apiRequest<InviteResponse>(`/escrows/${escrowId}/invite`, { method: 'POST' });
}

export function acceptEscrowTerms(escrowId: string): Promise<EscrowDetailResponse> {
  return apiRequest<EscrowDetailResponse>(`/escrows/${escrowId}/accept-terms`, { method: 'POST' });
}

export function cancelEscrow(escrowId: string): Promise<EscrowDetailResponse> {
  return apiRequest<EscrowDetailResponse>(`/escrows/${escrowId}/cancel`, { method: 'POST' });
}

export function shipEscrow(
  escrowId: string,
  trackingReference?: string,
): Promise<EscrowDetailResponse> {
  return apiRequest<EscrowDetailResponse>(`/escrows/${escrowId}/ship`, {
    method: 'POST',
    body: { trackingReference },
  });
}

export function confirmEscrowDelivery(escrowId: string): Promise<EscrowDetailResponse> {
  return apiRequest<EscrowDetailResponse>(`/escrows/${escrowId}/confirm-delivery`, {
    method: 'POST',
  });
}

export function releaseEscrow(escrowId: string): Promise<EscrowDetailResponse> {
  return apiRequest<EscrowDetailResponse>(`/escrows/${escrowId}/release`, { method: 'POST' });
}
