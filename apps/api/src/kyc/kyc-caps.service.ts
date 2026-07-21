import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Money } from '../common/money/money';
import { KycTier } from './entities/kyc-tier.enum';

@Injectable()
export class KycCapsService {
  constructor(private readonly configService: ConfigService) {}

  getCap(tier: KycTier): Money | null {
    switch (tier) {
      case KycTier.TIER_0:
        return Money.zero('NGN');
      case KycTier.TIER_1:
        return Money.of(
          this.configService.getOrThrow<number>('KYC_TIER_1_CAP_KOBO'),
          'NGN',
        );
      case KycTier.TIER_2:
        return Money.of(
          this.configService.getOrThrow<number>('KYC_TIER_2_CAP_KOBO'),
          'NGN',
        );
      case KycTier.TIER_3:
        return null;
    }
  }
}
