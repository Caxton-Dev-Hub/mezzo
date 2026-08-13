import type {
  AdminDisputePacketResponse,
  AdminDisputeSummaryResponse,
  AdminEscrowResponse,
  AdminPaymentIntentResponse,
  AdminPayoutResponse,
  AdminRiskItemResponse,
  ArbitrationRecordResponse,
  AuditEventResponse,
  DisputeState,
  EscrowState,
  PaymentIntentStatus,
  PayoutStatus,
  PlatformSettingsResponse,
  UpdateVerificationEnabledDto,
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

export function listAdminEscrows(state?: EscrowState): Promise<AdminEscrowResponse[]> {
  const query = state ? `?state=${state}` : '';
  return apiRequest<AdminEscrowResponse[]>(`/admin/escrows${query}`);
}

export function listAdminAtRisk(): Promise<AdminRiskItemResponse[]> {
  return apiRequest<AdminRiskItemResponse[]>('/admin/escrows/at-risk');
}

export function listAdminPayouts(status?: PayoutStatus): Promise<AdminPayoutResponse[]> {
  const query = status ? `?status=${status}` : '';
  return apiRequest<AdminPayoutResponse[]>(`/admin/payouts${query}`);
}

export function listAdminPaymentIntents(
  status?: PaymentIntentStatus,
): Promise<AdminPaymentIntentResponse[]> {
  const query = status ? `?status=${status}` : '';
  return apiRequest<AdminPaymentIntentResponse[]>(`/admin/payment-intents${query}`);
}

export function getPlatformSettings(): Promise<PlatformSettingsResponse> {
  return apiRequest<PlatformSettingsResponse>('/admin/settings');
}

export function setVerificationEnabled(
  dto: UpdateVerificationEnabledDto,
): Promise<PlatformSettingsResponse> {
  return apiRequest<PlatformSettingsResponse>('/admin/settings/verification', {
    method: 'POST',
    body: dto,
  });
}

export function requestArbitrationRecommendation(
  disputeId: string,
): Promise<ArbitrationRecordResponse> {
  return apiRequest<ArbitrationRecordResponse>(
    `/disputes/${disputeId}/arbitration-recommendations`,
    { method: 'POST' },
  );
}
