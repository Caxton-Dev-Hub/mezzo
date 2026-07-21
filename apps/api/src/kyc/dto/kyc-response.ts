import { KycVerification } from '../../database/entities/kyc-verification.entity';
import { KycTier } from '../entities/kyc-tier.enum';
import { KycVerificationStatus } from '../entities/kyc-verification-status.enum';

export interface KycVerificationResponse {
  id: string;
  status: KycVerificationStatus;
  requestedTier: KycTier;
  providerReference: string;
  createdAt: Date;
}

export function toKycVerificationResponse(verification: KycVerification): KycVerificationResponse {
  return {
    id: verification.id,
    status: verification.status,
    requestedTier: verification.requestedTier,
    providerReference: verification.providerReference,
    createdAt: verification.createdAt,
  };
}

export interface KycStatusResponse {
  tier: KycTier;
  latestVerification: KycVerificationResponse | null;
}
