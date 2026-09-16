import type { KycStatusResponse, KycTier, SubmitManualKycDto } from '@mezzo/shared-types';
import { ApiError } from './api-error';

type SubmittableTier = SubmitManualKycDto['tier'];

const TIER_ORDER: readonly KycTier[] = ['TIER_0', 'TIER_1', 'TIER_2', 'TIER_3'];

export const PAYOUT_MIN_TIER: SubmittableTier = 'TIER_1';

export const KYC_TIER_LABELS: Record<KycTier, string> = {
  TIER_0: 'Unverified',
  TIER_1: 'Identity verified',
  TIER_2: 'Address verified',
  TIER_3: 'Fully verified',
};

export function meetsTier(tier: KycTier, minimum: KycTier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(minimum);
}

export function verificationBlocks(status: KycStatusResponse, minimum: KycTier): boolean {
  return status.verificationEnabled && !meetsTier(status.tier, minimum);
}

function isSubmittableTier(value: unknown): value is SubmittableTier {
  return value === 'TIER_1' || value === 'TIER_2' || value === 'TIER_3';
}

function nextTier(tier: KycTier): SubmittableTier {
  const candidate = TIER_ORDER[TIER_ORDER.indexOf(tier) + 1];
  return isSubmittableTier(candidate) ? candidate : 'TIER_3';
}

export function tierBlockedBy(error: unknown, currentTier: KycTier): SubmittableTier | null {
  if (!(error instanceof ApiError)) {
    return null;
  }

  if (error.code === 'KYC_TIER_REQUIRED') {
    const required = error.details?.requiredTier;
    return isSubmittableTier(required) ? required : PAYOUT_MIN_TIER;
  }

  if (error.code === 'TRANSACTION_CAP_EXCEEDED') {
    return nextTier(currentTier);
  }

  return null;
}
