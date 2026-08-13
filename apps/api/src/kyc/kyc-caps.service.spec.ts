import { ConfigService } from '@nestjs/config';
import { KycCapsService } from './kyc-caps.service';
import { KycTier } from './entities/kyc-tier.enum';

const TIER_1_CAP = 5_000_000;
const TIER_2_CAP = 50_000_000;

function buildService(): { service: KycCapsService; getOrThrow: jest.Mock } {
  const getOrThrow = jest.fn().mockImplementation((key: string) => {
    if (key === 'KYC_TIER_1_CAP_KOBO') {
      return TIER_1_CAP;
    }
    if (key === 'KYC_TIER_2_CAP_KOBO') {
      return TIER_2_CAP;
    }
    throw new Error(`Unexpected config key ${key}`);
  });

  return {
    service: new KycCapsService({ getOrThrow } as unknown as ConfigService),
    getOrThrow,
  };
}

describe('KycCapsService.getCap', () => {
  it('caps an unverified user at zero, so they cannot transact at all', () => {
    const { service } = buildService();

    const cap = service.getCap(KycTier.TIER_0);

    expect(cap?.amount).toBe(0);
    expect(cap?.currency).toBe('NGN');
  });

  it('reads the tier 1 cap from configuration', () => {
    const { service } = buildService();

    expect(service.getCap(KycTier.TIER_1)?.amount).toBe(TIER_1_CAP);
  });

  it('reads the tier 2 cap from configuration', () => {
    const { service } = buildService();

    expect(service.getCap(KycTier.TIER_2)?.amount).toBe(TIER_2_CAP);
  });

  it('leaves tier 3 uncapped', () => {
    const { service } = buildService();

    expect(service.getCap(KycTier.TIER_3)).toBeNull();
  });

  it('raises the ceiling monotonically as tiers climb', () => {
    const { service } = buildService();

    const tier0 = service.getCap(KycTier.TIER_0);
    const tier1 = service.getCap(KycTier.TIER_1);
    const tier2 = service.getCap(KycTier.TIER_2);

    expect(tier0!.amount).toBeLessThan(tier1!.amount);
    expect(tier1!.amount).toBeLessThan(tier2!.amount);
  });

  it('expresses every cap in the platform currency', () => {
    const { service } = buildService();

    for (const tier of [KycTier.TIER_0, KycTier.TIER_1, KycTier.TIER_2]) {
      expect(service.getCap(tier)?.currency).toBe('NGN');
    }
  });
});
