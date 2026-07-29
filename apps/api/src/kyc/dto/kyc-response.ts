import { KycStatusResponse, KycVerificationResponse } from '@mezzo/shared-types';
import { KycVerification } from '../../database/entities/kyc-verification.entity';

export type { KycStatusResponse, KycVerificationResponse };

export function toKycVerificationResponse(verification: KycVerification): KycVerificationResponse {
  return {
    id: verification.id,
    status: verification.status,
    requestedTier: verification.requestedTier,
    providerReference: verification.providerReference,
    createdAt: verification.createdAt,
  };
}
