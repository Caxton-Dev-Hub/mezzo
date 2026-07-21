import { KycTier } from '../entities/kyc-tier.enum';

export interface KycSubmissionRequest {
  userId: string;
  tier: KycTier;
}

export interface KycSubmissionResult {
  providerReference: string;
}

export const KYC_PROVIDER = Symbol('KYC_PROVIDER');

export interface KycProvider {
  readonly name: string;
  submit(request: KycSubmissionRequest): Promise<KycSubmissionResult>;
}
