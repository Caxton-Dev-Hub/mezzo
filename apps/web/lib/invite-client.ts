import type { EscrowDetailResponse, InvitePreviewResponse } from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function getInvitePreview(token: string): Promise<InvitePreviewResponse> {
  return apiRequest<InvitePreviewResponse>(`/invites/${token}`, { skipAuth: true });
}

export function acceptInvite(token: string): Promise<EscrowDetailResponse> {
  return apiRequest<EscrowDetailResponse>(`/invites/${token}/accept`, { method: 'POST' });
}
