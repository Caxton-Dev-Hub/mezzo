export enum KycTier {
  TIER_0 = 'TIER_0',
  TIER_1 = 'TIER_1',
  TIER_2 = 'TIER_2',
  TIER_3 = 'TIER_3',
}

const TIER_RANK: Record<KycTier, number> = {
  [KycTier.TIER_0]: 0,
  [KycTier.TIER_1]: 1,
  [KycTier.TIER_2]: 2,
  [KycTier.TIER_3]: 3,
};

export function tierRank(tier: KycTier): number {
  return TIER_RANK[tier];
}

export function tierMeetsMinimum(tier: KycTier, minimum: KycTier): boolean {
  return tierRank(tier) >= tierRank(minimum);
}
