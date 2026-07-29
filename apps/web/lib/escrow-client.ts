import type {
  CreateEscrowDto,
  EscrowDetailResponse,
  EscrowTermsResponse,
  InviteResponse,
  UpdateEscrowTermsDto,
} from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function createEscrow(dto: CreateEscrowDto): Promise<EscrowDetailResponse> {
  return apiRequest<EscrowDetailResponse>('/escrows', { method: 'POST', body: dto });
}

export function getEscrow(escrowId: string): Promise<EscrowDetailResponse> {
  return apiRequest<EscrowDetailResponse>(`/escrows/${escrowId}`);
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
