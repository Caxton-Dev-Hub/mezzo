import { describe, expect, it } from 'vitest';
import type { KycStatusResponse, KycTier } from '@mezzo/shared-types';
import { ApiError } from '@/lib/api-error';
import {
  KYC_TIER_LABELS,
  PAYOUT_MIN_TIER,
  meetsTier,
  tierBlockedBy,
  verificationBlocks,
} from '@/lib/kyc-tiers';

function apiError(code: string, details?: Record<string, unknown>): ApiError {
  return new ApiError({ statusCode: 403, code, message: 'blocked', details });
}

describe('meetsTier', () => {
  it('accepts a tier that exactly meets the minimum', () => {
    expect(meetsTier('TIER_1', 'TIER_1')).toBe(true);
  });

  it('accepts a tier above the minimum', () => {
    expect(meetsTier('TIER_3', 'TIER_1')).toBe(true);
  });

  it('rejects a tier below the minimum', () => {
    expect(meetsTier('TIER_0', 'TIER_1')).toBe(false);
  });

  it('treats an unverified account as meeting a zero minimum', () => {
    expect(meetsTier('TIER_0', 'TIER_0')).toBe(true);
  });
});

describe('tierBlockedBy', () => {
  it('ignores an error that is not from the API', () => {
    expect(tierBlockedBy(new Error('network down'), 'TIER_0')).toBeNull();
  });

  it('ignores an unrelated API error', () => {
    expect(tierBlockedBy(apiError('ILLEGAL_TRANSITION'), 'TIER_0')).toBeNull();
  });

  it('reads the required tier out of a tier-required refusal', () => {
    expect(tierBlockedBy(apiError('KYC_TIER_REQUIRED', { requiredTier: 'TIER_2' }), 'TIER_0')).toBe(
      'TIER_2',
    );
  });

  it('falls back to the payout minimum when the refusal names no tier', () => {
    expect(tierBlockedBy(apiError('KYC_TIER_REQUIRED'), 'TIER_0')).toBe(PAYOUT_MIN_TIER);
  });

  it('ignores a nonsense required tier and falls back to the minimum', () => {
    expect(tierBlockedBy(apiError('KYC_TIER_REQUIRED', { requiredTier: 'TIER_0' }), 'TIER_0')).toBe(
      PAYOUT_MIN_TIER,
    );
  });

  it('prompts the next tier up when the caller hits their transaction cap', () => {
    expect(tierBlockedBy(apiError('TRANSACTION_CAP_EXCEEDED'), 'TIER_1')).toBe('TIER_2');
  });

  it('prompts tier 1 for an unverified user who hits the cap', () => {
    expect(tierBlockedBy(apiError('TRANSACTION_CAP_EXCEEDED'), 'TIER_0')).toBe('TIER_1');
  });

  it('stops at the top tier rather than inventing a higher one', () => {
    expect(tierBlockedBy(apiError('TRANSACTION_CAP_EXCEEDED'), 'TIER_3')).toBe('TIER_3');
  });
});

describe('verificationBlocks', () => {
  function status(tier: KycTier, verificationEnabled: boolean): KycStatusResponse {
    return { tier, latestVerification: null, verificationEnabled };
  }

  it('blocks an under-tier user while verification is live', () => {
    expect(verificationBlocks(status('TIER_0', true), PAYOUT_MIN_TIER)).toBe(true);
  });

  it('lets an under-tier user through once verification is set to coming soon', () => {
    expect(verificationBlocks(status('TIER_0', false), PAYOUT_MIN_TIER)).toBe(false);
  });

  it('never blocks a user who already meets the tier', () => {
    expect(verificationBlocks(status('TIER_2', true), PAYOUT_MIN_TIER)).toBe(false);
    expect(verificationBlocks(status('TIER_2', false), PAYOUT_MIN_TIER)).toBe(false);
  });
});

describe('KYC_TIER_LABELS', () => {
  it('gives every tier a human-readable label', () => {
    expect(Object.values(KYC_TIER_LABELS).every((label) => label.length > 0)).toBe(true);
    expect(KYC_TIER_LABELS.TIER_0).toBe('Unverified');
  });
});
