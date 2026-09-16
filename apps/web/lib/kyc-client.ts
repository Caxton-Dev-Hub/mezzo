import type { KycStatusResponse } from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function getKycStatus(): Promise<KycStatusResponse> {
  return apiRequest<KycStatusResponse>('/kyc/me');
}
