import type {
  CreateEscrowDto,
  EscrowDetailResponse,
  EscrowEventResponse,
  EscrowListResponse,
  EscrowSortBy,
  EscrowSortDir,
  EscrowState,
  EscrowTermsResponse,
  InviteResponse,
  UpdateEscrowTermsDto,
} from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export interface ListEscrowsParams {
  page?: number;
  pageSize?: number;
  state?: EscrowState;
  search?: string;
  sortBy?: EscrowSortBy;
  sortDir?: EscrowSortDir;
}

export function createEscrow(dto: CreateEscrowDto): Promise<EscrowDetailResponse> {
  return apiRequest<EscrowDetailResponse>('/escrows', { method: 'POST', body: dto });
}

export function listEscrows(params: ListEscrowsParams = {}): Promise<EscrowListResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.state) query.set('state', params.state);
  if (params.search) query.set('search', params.search);
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortDir) query.set('sortDir', params.sortDir);
  const queryString = query.toString();
  return apiRequest<EscrowListResponse>(`/escrows${queryString ? `?${queryString}` : ''}`);
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
