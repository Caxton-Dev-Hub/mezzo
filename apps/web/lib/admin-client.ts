import type {
  AdminDisputePacketResponse,
  AdminDisputeSummaryResponse,
  ArbitrationRecordResponse,
  AuditEventResponse,
  DisputeState,
} from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function listAdminDisputes(state?: DisputeState): Promise<AdminDisputeSummaryResponse[]> {
  const query = state ? `?state=${state}` : '';
  return apiRequest<AdminDisputeSummaryResponse[]>(`/admin/disputes${query}`);
}

export function getAdminDisputePacket(disputeId: string): Promise<AdminDisputePacketResponse> {
  return apiRequest<AdminDisputePacketResponse>(`/admin/disputes/${disputeId}`);
}

export function listAuditEvents(entityType: string, entityId: string): Promise<AuditEventResponse[]> {
  return apiRequest<AuditEventResponse[]>(
    `/admin/audit?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
  );
}

export function requestArbitrationRecommendation(
  disputeId: string,
): Promise<ArbitrationRecordResponse> {
  return apiRequest<ArbitrationRecordResponse>(
    `/disputes/${disputeId}/arbitration-recommendations`,
    { method: 'POST' },
  );
}
