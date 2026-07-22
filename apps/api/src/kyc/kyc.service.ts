import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { KycVerification } from '../database/entities/kyc-verification.entity';
import { KycEvent } from '../database/entities/kyc-event.entity';
import { Money } from '../common/money/money';
import { KycTier, tierRank } from './entities/kyc-tier.enum';
import { KycVerificationStatus } from './entities/kyc-verification-status.enum';
import { KycEventType } from './entities/kyc-event-type.enum';
import { KYC_PROVIDER, KycProvider } from './providers/kyc-provider.interface';
import { KycCapsService } from './kyc-caps.service';
import { KycWebhookDto } from './dto/kyc.schemas';
import { KycTierRequiredError } from './errors/kyc-tier-required.error';
import { TransactionCapExceededError } from './errors/transaction-cap-exceeded.error';
import { UnknownKycVerificationError } from './errors/unknown-kyc-verification.error';

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(KycVerification)
    private readonly verifications: Repository<KycVerification>,
    @InjectRepository(KycEvent)
    private readonly events: Repository<KycEvent>,
    @Inject(KYC_PROVIDER)
    private readonly provider: KycProvider,
    private readonly caps: KycCapsService,
  ) {}

  async submit(userId: string, tier: KycTier): Promise<KycVerification> {
    const user = await this.getUserOrThrow(userId);
    const { providerReference } = await this.provider.submit({ userId, tier });

    const verification = await this.verifications.save(
      this.verifications.create({
        userId,
        requestedTier: tier,
        status: KycVerificationStatus.PENDING,
        provider: this.provider.name,
        providerReference,
      }),
    );

    await this.events.save(
      this.events.create({
        userId,
        verificationId: verification.id,
        type: KycEventType.SUBMITTED,
        previousTier: user.kycTier,
        newTier: null,
        providerReference,
      }),
    );

    return verification;
  }

  async handleProviderCallback(dto: KycWebhookDto): Promise<KycVerification> {
    const verification = await this.verifications.findOne({
      where: { providerReference: dto.providerReference },
    });

    if (!verification) {
      throw new UnknownKycVerificationError();
    }

    if (verification.status !== KycVerificationStatus.PENDING) {
      return verification;
    }

    const user = await this.getUserOrThrow(verification.userId);
    const previousTier = user.kycTier;

    if (dto.status === 'APPROVED') {
      verification.status = KycVerificationStatus.APPROVED;
      await this.verifications.save(verification);

      user.kycTier = verification.requestedTier;
      await this.users.save(user);

      await this.events.save(
        this.events.create({
          userId: verification.userId,
          verificationId: verification.id,
          type: KycEventType.APPROVED,
          previousTier,
          newTier: verification.requestedTier,
          providerReference: dto.providerReference,
        }),
      );
    } else {
      verification.status =
        dto.status === 'EXPIRED' ? KycVerificationStatus.EXPIRED : KycVerificationStatus.REJECTED;
      await this.verifications.save(verification);

      await this.events.save(
        this.events.create({
          userId: verification.userId,
          verificationId: verification.id,
          type: dto.status === 'EXPIRED' ? KycEventType.EXPIRED : KycEventType.REJECTED,
          previousTier,
          newTier: null,
          providerReference: dto.providerReference,
        }),
      );
    }

    return verification;
  }

  async requireTier(userId: string, minTier: KycTier): Promise<void> {
    const tier = await this.getTier(userId);
    if (tierRank(tier) < tierRank(minTier)) {
      throw new KycTierRequiredError(minTier);
    }
  }

  async assertCanFund(userId: string, amount: Money): Promise<void> {
    const tier = await this.getTier(userId);

    if (tierRank(tier) < tierRank(KycTier.TIER_1)) {
      throw new KycTierRequiredError(KycTier.TIER_1);
    }

    const cap = this.caps.getCap(tier);
    if (cap && amount.greaterThan(cap)) {
      throw new TransactionCapExceededError(tier, cap);
    }
  }

  async getTier(userId: string): Promise<KycTier> {
    const user = await this.getUserOrThrow(userId);
    return user.kycTier;
  }

  async getLatestVerification(userId: string): Promise<KycVerification | null> {
    return this.verifications.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async listVerifications(status?: KycVerificationStatus): Promise<KycVerification[]> {
    return this.verifications.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async overrideTier(userId: string, tier: KycTier): Promise<{ before: KycTier; after: KycTier }> {
    const user = await this.getUserOrThrow(userId);
    const previousTier = user.kycTier;

    const verification = await this.verifications.save(
      this.verifications.create({
        userId,
        requestedTier: tier,
        status: KycVerificationStatus.APPROVED,
        provider: 'manual',
        providerReference: `manual-override:${randomUUID()}`,
      }),
    );

    user.kycTier = tier;
    await this.users.save(user);

    await this.events.save(
      this.events.create({
        userId,
        verificationId: verification.id,
        type: KycEventType.APPROVED,
        previousTier,
        newTier: tier,
        providerReference: verification.providerReference,
      }),
    );

    return { before: previousTier, after: tier };
  }

  private async getUserOrThrow(userId: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
