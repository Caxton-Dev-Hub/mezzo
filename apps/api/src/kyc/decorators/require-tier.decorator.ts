import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { KycTier } from '../entities/kyc-tier.enum';

export const REQUIRE_TIER_KEY = 'requireTier';

export const RequireTier = (minimum: KycTier): CustomDecorator<string> =>
  SetMetadata(REQUIRE_TIER_KEY, minimum);
