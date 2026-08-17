import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { KycVerification } from '../database/entities/kyc-verification.entity';
import { KycEvent } from '../database/entities/kyc-event.entity';
import { KycDocument } from '../database/entities/kyc-document.entity';
import { Money } from '../common/money/money';
import { KycTier, tierRank } from './entities/kyc-tier.enum';
import { KycVerificationStatus } from './entities/kyc-verification-status.enum';
import { KycEventType } from './entities/kyc-event-type.enum';
import { KycDocumentType } from './entities/kyc-document-type.enum';
import { KYC_PROVIDER, KycProvider } from './providers/kyc-provider.interface';
import { KycCapsService } from './kyc-caps.service';
import { KycWebhookDto } from './dto/kyc.schemas';
import { KycTierRequiredError } from './errors/kyc-tier-required.error';
import { TransactionCapExceededError } from './errors/transaction-cap-exceeded.error';
import { UnknownKycVerificationError } from './errors/unknown-kyc-verification.error';
import { VerificationDisabledError } from './errors/verification-disabled.error';
import { KycDocumentMimeMismatchError } from './errors/kyc-document-mime-mismatch.error';
import { MissingKycDocumentsError } from './errors/missing-kyc-documents.error';
import { KycVerificationNotPendingError } from './errors/kyc-verification-not-pending.error';
import { InvalidKycDocumentKeyError } from './errors/invalid-kyc-document-key.error';
import { SettingsService } from '../settings/settings.service';
import { STORAGE_PROVIDER, StorageProvider } from '../evidence/storage/storage-provider.interface';
import { MediaAnalysisService } from '../evidence/media-analysis.service';
import { PresignKycDocumentResponse } from '@mezzo/shared-types';

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(KycVerification)
    private readonly verifications: Repository<KycVerification>,
    @InjectRepository(KycEvent)
    private readonly events: Repository<KycEvent>,
    @InjectRepository(KycDocument)
    private readonly documents: Repository<KycDocument>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(KYC_PROVIDER)
    private readonly provider: KycProvider,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
    private readonly mediaAnalysis: MediaAnalysisService,
    private readonly caps: KycCapsService,
    private readonly settingsService: SettingsService,
  ) {}

  async submit(userId: string, tier: KycTier): Promise<KycVerification> {
    if (!(await this.settingsService.isVerificationEnabled())) {
      throw new VerificationDisabledError();
    }

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
    if (!(await this.settingsService.isVerificationEnabled())) {
      return;
    }

    const tier = await this.getTier(userId);
    if (tierRank(tier) < tierRank(minTier)) {
      throw new KycTierRequiredError(minTier);
    }
  }

  async assertCanFund(userId: string, amount: Money, requiresVerification: boolean): Promise<void> {
    if (!requiresVerification) {
      return;
    }

    if (!(await this.settingsService.isVerificationEnabled())) {
      return;
    }

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

  async presignDocument(
    userId: string,
    _documentType: KycDocumentType,
    mimeType: string,
  ): Promise<PresignKycDocumentResponse> {
    const key = `kyc-documents/${userId}/${randomUUID()}`;
    const uploadUrl = await this.storage.getPresignedUploadUrl(key, mimeType);
    return { uploadUrl, key };
  }

  async confirmDocument(
    userId: string,
    key: string,
    documentType: KycDocumentType,
    declaredMime: string,
  ): Promise<KycDocument> {
    if (!key.startsWith(`kyc-documents/${userId}/`)) {
      throw new InvalidKycDocumentKeyError();
    }

    const buffer = await this.storage.getObject(key);
    const analysis = await this.mediaAnalysis.analyze(buffer);

    if (!analysis.detectedMime || analysis.detectedMime !== declaredMime) {
      await this.storage.deleteObject(key).catch(() => undefined);
      throw new KycDocumentMimeMismatchError(declaredMime, analysis.detectedMime);
    }

    return this.documents.save(
      this.documents.create({
        userId,
        verificationId: null,
        documentType,
        storageKey: key,
        contentHash: analysis.contentHash,
        declaredMime,
        detectedMime: analysis.detectedMime,
        sizeBytes: analysis.sizeBytes,
        width: analysis.width,
        height: analysis.height,
      }),
    );
  }

  async submitManual(
    userId: string,
    tier: KycTier,
    documentIds: string[],
  ): Promise<KycVerification> {
    if (!(await this.settingsService.isVerificationEnabled())) {
      throw new VerificationDisabledError();
    }

    const documents = await this.documents.find({
      where: { id: In(documentIds), userId, verificationId: IsNull() },
    });
    if (documents.length !== documentIds.length) {
      throw new MissingKycDocumentsError();
    }

    const user = await this.getUserOrThrow(userId);

    return this.dataSource.transaction(async (manager) => {
      const verification = await manager.save(
        KycVerification,
        manager.create(KycVerification, {
          userId,
          requestedTier: tier,
          status: KycVerificationStatus.PENDING,
          provider: 'manual',
          providerReference: `manual-submission:${randomUUID()}`,
        }),
      );

      await manager.update(
        KycDocument,
        { id: In(documentIds) },
        { verificationId: verification.id },
      );

      await manager.save(
        KycEvent,
        manager.create(KycEvent, {
          userId,
          verificationId: verification.id,
          type: KycEventType.SUBMITTED,
          previousTier: user.kycTier,
          newTier: null,
          providerReference: verification.providerReference,
        }),
      );

      return verification;
    });
  }

  async approveVerification(verificationId: string): Promise<KycVerification> {
    const verification = await this.getVerificationOrThrow(verificationId);
    if (verification.status !== KycVerificationStatus.PENDING) {
      throw new KycVerificationNotPendingError();
    }

    const user = await this.getUserOrThrow(verification.userId);
    const previousTier = user.kycTier;

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
        providerReference: verification.providerReference,
      }),
    );

    return verification;
  }

  async rejectVerification(verificationId: string): Promise<KycVerification> {
    const verification = await this.getVerificationOrThrow(verificationId);
    if (verification.status !== KycVerificationStatus.PENDING) {
      throw new KycVerificationNotPendingError();
    }

    const user = await this.getUserOrThrow(verification.userId);

    verification.status = KycVerificationStatus.REJECTED;
    await this.verifications.save(verification);

    await this.events.save(
      this.events.create({
        userId: verification.userId,
        verificationId: verification.id,
        type: KycEventType.REJECTED,
        previousTier: user.kycTier,
        newTier: null,
        providerReference: verification.providerReference,
      }),
    );

    return verification;
  }

  async listDocuments(
    verificationId: string,
  ): Promise<Array<{ document: KycDocument; url: string }>> {
    const documents = await this.documents.find({
      where: { verificationId },
      order: { createdAt: 'ASC' },
    });

    return Promise.all(
      documents.map(async (document) => ({
        document,
        url: await this.storage.getPresignedDownloadUrl(document.storageKey),
      })),
    );
  }

  private async getVerificationOrThrow(verificationId: string): Promise<KycVerification> {
    const verification = await this.verifications.findOne({ where: { id: verificationId } });
    if (!verification) {
      throw new UnknownKycVerificationError();
    }
    return verification;
  }

  private async getUserOrThrow(userId: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
