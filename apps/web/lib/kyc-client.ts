import type { KycStatusResponse, KycVerificationResponse, SubmitKycDto } from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function getKycStatus(): Promise<KycStatusResponse> {
  return apiRequest<KycStatusResponse>('/kyc/me');
}

export function submitKycVerification(dto: SubmitKycDto): Promise<KycVerificationResponse> {
  return apiRequest<KycVerificationResponse>('/kyc/submissions', { method: 'POST', body: dto });
}
