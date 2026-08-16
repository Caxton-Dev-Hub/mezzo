import type {
  AdminActionReasonDto,
  AdminDisputePacketResponse,
  AdminDisputeSummaryResponse,
  AdminEscrowResponse,
  AdminPaymentIntentResponse,
  AdminPayoutResponse,
  AdminRiskItemResponse,
  AdminUserDetailResponse,
  AdminUserListQuery,
  AdminUserListResponse,
  AdminWaitlistListResponse,
  ArbitrationRecordResponse,
  AuditEventResponse,
  DisputeState,
  EscrowState,
  HideChatMessageResponse,
  KycTier,
  KycVerificationStatus,
  PaymentIntentStatus,
  PayoutStatus,
  PlatformSettingsResponse,
  UpdateUserRoleDto,
  UpdateUserRoleResult,
  UpdateUserStatusDto,
  UpdateUserStatusResult,
  UpdateVerificationEnabledDto,
} from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export interface AdminKycVerificationResponse {
  id: string;
  userId: string;
  status: KycVerificationStatus;
  requestedTier: KycTier;
  provider: string;
  providerReference: string;
  createdAt: string;
}

export interface LedgerEntryResponse {
  id: string;
  accountId: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
  currency: 'NGN' | 'USD';
  createdAt: string;
}

export interface LedgerPostingResponse {
  id: string;
  idempotencyKey: string;
  correlationId: string | null;
  createdAt: string;
  entries: LedgerEntryResponse[];
}

export interface ReconciliationReport {
  globalBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
  driftedAccountRefs: string[];
}

export interface WhatsappTransactionalSettingsResponse {
  whatsappTransactionalEnabled: boolean;
}

export interface UpdateWhatsappTransactionalEnabledDto {
  enabled: boolean;
  reason: string;
}

export interface PostAdjustmentDto {
  debitAccountRef: string;
  creditAccountRef: string;
  amount: number;
  currency: 'NGN' | 'USD';
  reason: string;
}

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

export function getWhatsappTransactionalSetting(): Promise<WhatsappTransactionalSettingsResponse> {
  return apiRequest<WhatsappTransactionalSettingsResponse>('/admin/settings/whatsapp-transactional');
}

export function setWhatsappTransactionalEnabled(
  dto: UpdateWhatsappTransactionalEnabledDto,
): Promise<WhatsappTransactionalSettingsResponse> {
  return apiRequest<WhatsappTransactionalSettingsResponse>(
    '/admin/settings/whatsapp-transactional',
    { method: 'POST', body: dto },
  );
}

export function listAdminUsers(query: Partial<AdminUserListQuery>): Promise<AdminUserListResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.role) params.set('role', query.role);
  if (query.status) params.set('status', query.status);
  if (query.kycTier) params.set('kycTier', query.kycTier);
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 20));
  return apiRequest<AdminUserListResponse>(`/admin/users?${params.toString()}`);
}

export function getAdminUser(id: string): Promise<AdminUserDetailResponse> {
  return apiRequest<AdminUserDetailResponse>(`/admin/users/${id}`);
}

export function updateUserRole(id: string, dto: UpdateUserRoleDto): Promise<UpdateUserRoleResult> {
  return apiRequest<UpdateUserRoleResult>(`/admin/users/${id}/role`, {
    method: 'PATCH',
    body: dto,
  });
}

export function updateUserStatus(
  id: string,
  dto: UpdateUserStatusDto,
): Promise<UpdateUserStatusResult> {
  return apiRequest<UpdateUserStatusResult>(`/admin/users/${id}/status`, {
    method: 'PATCH',
    body: dto,
  });
}

export function listAdminWaitlist(page: number, pageSize = 20): Promise<AdminWaitlistListResponse> {
  return apiRequest<AdminWaitlistListResponse>(
    `/admin/waitlist?page=${page}&pageSize=${pageSize}`,
  );
}

export function listAdminKycQueue(
  status?: KycVerificationStatus,
): Promise<AdminKycVerificationResponse[]> {
  const query = status ? `?status=${status}` : '';
  return apiRequest<AdminKycVerificationResponse[]>(`/admin/kyc/queue${query}`);
}

export function overrideKycTier(
  userId: string,
  dto: { tier: KycTier; reason: string },
): Promise<{ before: string; after: string }> {
  return apiRequest<{ before: string; after: string }>(`/admin/kyc/users/${userId}/tier`, {
    method: 'POST',
    body: dto,
  });
}

export function getLedgerReconciliation(): Promise<ReconciliationReport> {
  return apiRequest<ReconciliationReport>('/admin/ledger/reconciliation');
}

export function listLedgerPostingsByCorrelationId(
  correlationId: string,
): Promise<LedgerPostingResponse[]> {
  return apiRequest<LedgerPostingResponse[]>(
    `/admin/ledger/postings?correlationId=${encodeURIComponent(correlationId)}`,
  );
}

export function listLedgerEntriesByAccountRef(
  accountRef: string,
  limit?: number,
): Promise<LedgerEntryResponse[]> {
  const query = limit ? `&limit=${limit}` : '';
  return apiRequest<LedgerEntryResponse[]>(
    `/admin/ledger/entries?accountRef=${encodeURIComponent(accountRef)}${query}`,
  );
}

export function postLedgerAdjustment(dto: PostAdjustmentDto): Promise<LedgerPostingResponse> {
  return apiRequest<LedgerPostingResponse>('/admin/ledger/adjustments', {
    method: 'POST',
    body: dto,
  });
}

export function listAdminAuditEventsAll(entityType?: string): Promise<AuditEventResponse[]> {
  const query = entityType ? `?entityType=${encodeURIComponent(entityType)}` : '';
  return apiRequest<AuditEventResponse[]>(`/admin/audit${query}`);
}

export function resolvePaymentIntentQuarantine(
  id: string,
  dto: AdminActionReasonDto,
): Promise<AdminPaymentIntentResponse> {
  return apiRequest<AdminPaymentIntentResponse>(
    `/admin/payment-intents/${id}/resolve-quarantine`,
    { method: 'POST', body: dto },
  );
}

export function retryPayout(id: string, dto: AdminActionReasonDto): Promise<AdminPayoutResponse> {
  return apiRequest<AdminPayoutResponse>(`/admin/payouts/${id}/retry`, {
    method: 'POST',
    body: dto,
  });
}

export function forceReleaseEscrow(
  id: string,
  dto: AdminActionReasonDto,
): Promise<AdminEscrowResponse> {
  return apiRequest<AdminEscrowResponse>(`/admin/escrows/${id}/force-release`, {
    method: 'POST',
    body: dto,
  });
}

export function forceRefundEscrow(
  id: string,
  dto: AdminActionReasonDto,
): Promise<AdminEscrowResponse> {
  return apiRequest<AdminEscrowResponse>(`/admin/escrows/${id}/force-refund`, {
    method: 'POST',
    body: dto,
  });
}

export function hideChatMessage(
  id: string,
  dto: AdminActionReasonDto,
): Promise<HideChatMessageResponse> {
  return apiRequest<HideChatMessageResponse>(`/admin/chat/messages/${id}/hide`, {
    method: 'POST',
    body: dto,
  });
}
