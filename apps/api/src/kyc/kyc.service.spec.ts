import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { KycService } from './kyc.service';
import { KycCapsService } from './kyc-caps.service';
import { KycTier } from './entities/kyc-tier.enum';
import { KycVerificationStatus } from './entities/kyc-verification-status.enum';
import { KycEventType } from './entities/kyc-event-type.enum';
import { KycDocumentType } from './entities/kyc-document-type.enum';
import { StorageProvider } from '../evidence/storage/storage-provider.interface';
import { MediaAnalysisService, MediaAnalysisResult } from '../evidence/media-analysis.service';
import { KycTierRequiredError } from './errors/kyc-tier-required.error';
import { TransactionCapExceededError } from './errors/transaction-cap-exceeded.error';
import { UnknownKycVerificationError } from './errors/unknown-kyc-verification.error';
import { VerificationDisabledError } from './errors/verification-disabled.error';
import { KycDocumentMimeMismatchError } from './errors/kyc-document-mime-mismatch.error';
import { MissingKycDocumentsError } from './errors/missing-kyc-documents.error';
import { KycVerificationNotPendingError } from './errors/kyc-verification-not-pending.error';
import { SettingsService } from '../settings/settings.service';
import { Money } from '../common/money/money';
import { User } from '../database/entities/user.entity';
import { KycVerification } from '../database/entities/kyc-verification.entity';
import { KycEvent } from '../database/entities/kyc-event.entity';
import { KycDocument } from '../database/entities/kyc-document.entity';
import { UserRole } from '../users/entities/user-role.enum';
import { UserStatus } from '../users/entities/user-status.enum';

class InMemoryUserRepository {
  constructor(readonly users: Map<string, User>) {}

  findOne({ where }: { where: { id: string } }): Promise<User | null> {
    return Promise.resolve(this.users.get(where.id) ?? null);
  }

  save(user: User): Promise<User> {
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }
}

class InMemoryVerificationRepository {
  readonly rows: KycVerification[] = [];

  create(entity: Partial<KycVerification>): KycVerification {
    return { ...entity, id: randomUUID() } as KycVerification;
  }

  save(entity: KycVerification): Promise<KycVerification> {
    const index = this.rows.findIndex((row) => row.id === entity.id);
    if (index === -1) {
      this.rows.push(entity);
    } else {
      this.rows[index] = entity;
    }
    return Promise.resolve(entity);
  }

  findOne({
    where,
    order,
  }: {
    where: { id?: string; userId?: string };
    order?: { createdAt: 'DESC' | 'ASC' };
  }): Promise<KycVerification | null> {
    let candidates = this.rows;
    if (where.id) {
      candidates = candidates.filter((row) => row.id === where.id);
    }
    if (where.userId) {
      candidates = candidates.filter((row) => row.userId === where.userId);
    }
    if (order?.createdAt === 'DESC') {
      candidates = [...candidates].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return Promise.resolve(candidates[0] ?? null);
  }
}

class InMemoryEventRepository {
  readonly rows: KycEvent[] = [];

  create(entity: Partial<KycEvent>): KycEvent {
    return { ...entity, id: randomUUID() } as KycEvent;
  }

  save(entity: KycEvent): Promise<KycEvent> {
    this.rows.push(entity);
    return Promise.resolve(entity);
  }
}

function buildUser(tier: KycTier): User {
  return {
    id: randomUUID(),
    email: `${randomUUID()}@example.com`,
    passwordHash: 'irrelevant',
    googleSub: null,
    phone: null,
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    kycTier: tier,
    businessName: null,
    bio: null,
    location: null,
    avatarKey: null,
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildVerification(overrides: Partial<KycVerification> = {}): KycVerification {
  return {
    id: randomUUID(),
    userId: randomUUID(),
    requestedTier: KycTier.TIER_1,
    status: KycVerificationStatus.PENDING,
    provider: 'manual',
    providerReference: `manual-submission:${randomUUID()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as KycVerification;
}

function buildHarness(verificationEnabled = true): {
  service: KycService;
  users: InMemoryUserRepository;
  verifications: InMemoryVerificationRepository;
  events: InMemoryEventRepository;
  documentsFind: jest.Mock;
  documentsSave: jest.Mock;
  managerSave: jest.Mock;
  managerUpdate: jest.Mock;
  storage: { [K in keyof StorageProvider]: jest.Mock };
  mediaAnalysis: { analyze: jest.Mock };
} {
  const usersMap = new Map<string, User>();
  const users = new InMemoryUserRepository(usersMap);
  const verifications = new InMemoryVerificationRepository();
  const events = new InMemoryEventRepository();

  const configValues: Record<string, number> = {
    KYC_TIER_1_CAP_KOBO: 50_000_000,
    KYC_TIER_2_CAP_KOBO: 500_000_000,
  };
  const configService = {
    getOrThrow: <T>(key: string): T => configValues[key] as T,
  } as unknown as ConfigService;

  const caps = new KycCapsService(configService);

  const settingsService = {
    isVerificationEnabled: jest.fn().mockResolvedValue(verificationEnabled),
  } as unknown as SettingsService;

  const documentsFind = jest.fn().mockResolvedValue([]);
  const documentsSave = jest.fn().mockImplementation((row) => Promise.resolve({ ...row, id: randomUUID() }));
  const documents = {
    find: documentsFind,
    save: documentsSave,
    create: (row: Partial<KycDocument>) => row,
  } as unknown as Repository<KycDocument>;

  const managerSave = jest
    .fn()
    .mockImplementation((_entity: unknown, row: Record<string, unknown>) =>
      Promise.resolve({ ...row, id: randomUUID() }),
    );
  const managerUpdate = jest.fn().mockResolvedValue({ affected: 1 });
  const manager = {
    create: (_entity: unknown, row: Record<string, unknown>) => row,
    save: managerSave,
    update: managerUpdate,
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn().mockImplementation((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
  } as unknown as DataSource;

  const storage = {
    getPresignedUploadUrl: jest.fn().mockResolvedValue('https://storage.test/upload'),
    getPresignedDownloadUrl: jest.fn().mockResolvedValue('https://storage.test/download'),
    getObject: jest.fn().mockResolvedValue(Buffer.from('file-bytes')),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };

  const mediaAnalysis = {
    analyze: jest.fn().mockResolvedValue({
      contentHash: 'hash-1',
      detectedMime: 'image/jpeg',
      sizeBytes: 10,
      width: 100,
      height: 100,
      capturedAt: null,
      deviceMake: null,
      deviceModel: null,
      gpsLatitude: null,
      gpsLongitude: null,
      hasExif: false,
    } satisfies MediaAnalysisResult),
  };

  const service = new KycService(
    users as unknown as Repository<User>,
    verifications as unknown as Repository<KycVerification>,
    events as unknown as Repository<KycEvent>,
    documents,
    dataSource,
    storage,
    mediaAnalysis as unknown as MediaAnalysisService,
    caps,
    settingsService,
  );

  return {
    service,
    users,
    verifications,
    events,
    documentsFind,
    documentsSave,
    managerSave,
    managerUpdate,
    storage,
    mediaAnalysis,
  };
}

describe('KycService', () => {
  describe('assertCanFund', () => {
    it('blocks a TIER_0 user with a verification-required error when verification is required', async () => {
      const { service, users } = buildHarness();
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);

      await expect(
        service.assertCanFund(user.id, Money.of(1000, 'NGN'), true),
      ).rejects.toBeInstanceOf(KycTierRequiredError);
    });

    it('rejects an amount above the TIER_1 cap, surfacing the cap', async () => {
      const { service, users } = buildHarness();
      const user = buildUser(KycTier.TIER_1);
      await users.save(user);

      const overCap = Money.of(50_000_001, 'NGN');
      await expect(service.assertCanFund(user.id, overCap, true)).rejects.toThrow(
        TransactionCapExceededError,
      );

      try {
        await service.assertCanFund(user.id, overCap, true);
        fail('expected TransactionCapExceededError');
      } catch (error) {
        expect(error).toBeInstanceOf(TransactionCapExceededError);
        expect((error as TransactionCapExceededError).details).toEqual({
          tier: KycTier.TIER_1,
          cap: { amount: 50_000_000, currency: 'NGN' },
        });
      }
    });

    it('allows an amount within the TIER_1 cap', async () => {
      const { service, users } = buildHarness();
      const user = buildUser(KycTier.TIER_1);
      await users.save(user);

      await expect(
        service.assertCanFund(user.id, Money.of(50_000_000, 'NGN'), true),
      ).resolves.toBeUndefined();
    });

    it('never caps a TIER_3 user', async () => {
      const { service, users } = buildHarness();
      const user = buildUser(KycTier.TIER_3);
      await users.save(user);

      await expect(
        service.assertCanFund(user.id, Money.of(10_000_000_000, 'NGN'), true),
      ).resolves.toBeUndefined();
    });

    it('skips the tier and cap checks entirely when verification is not required', async () => {
      const { service, users } = buildHarness();
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);

      await expect(
        service.assertCanFund(user.id, Money.of(10_000_000_000, 'NGN'), false),
      ).resolves.toBeUndefined();
    });
  });

  describe('requireTier', () => {
    it('throws when the user is below the minimum tier', async () => {
      const { service, users } = buildHarness();
      const user = buildUser(KycTier.TIER_1);
      await users.save(user);

      await expect(service.requireTier(user.id, KycTier.TIER_2)).rejects.toBeInstanceOf(
        KycTierRequiredError,
      );
    });

    it('passes when the user meets the minimum tier', async () => {
      const { service, users } = buildHarness();
      const user = buildUser(KycTier.TIER_2);
      await users.save(user);

      await expect(service.requireTier(user.id, KycTier.TIER_2)).resolves.toBeUndefined();
    });
  });

  describe('when an admin has turned verification off', () => {
    it('lets a TIER_0 user through a tier gate', async () => {
      const { service, users } = buildHarness(false);
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);

      await expect(service.requireTier(user.id, KycTier.TIER_1)).resolves.toBeUndefined();
    });

    it('lets a TIER_0 user fund an escrow that requires verification', async () => {
      const { service, users } = buildHarness(false);
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);

      await expect(
        service.assertCanFund(user.id, Money.of(900_000_000, 'NGN'), true),
      ).resolves.toBeUndefined();
    });

    it('still enforces gates once verification is turned back on', async () => {
      const { service, users } = buildHarness(true);
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);

      await expect(service.requireTier(user.id, KycTier.TIER_1)).rejects.toBeInstanceOf(
        KycTierRequiredError,
      );
    });
  });

  describe('presignDocument', () => {
    it('returns an upload url and a key scoped to the user', async () => {
      const { service, storage } = buildHarness();
      const userId = randomUUID();

      const result = await service.presignDocument(userId, KycDocumentType.GOVERNMENT_ID, 'image/jpeg');

      expect(result).toEqual({ uploadUrl: 'https://storage.test/upload', key: expect.stringContaining(userId) as string });
      expect(storage.getPresignedUploadUrl).toHaveBeenCalledWith(
        expect.stringContaining(`kyc-documents/${userId}/`) as string,
        'image/jpeg',
      );
    });
  });

  describe('confirmDocument', () => {
    it('rejects a key that does not belong to the requesting user', async () => {
      const { service } = buildHarness();

      await expect(
        service.confirmDocument(
          randomUUID(),
          'kyc-documents/someone-else/abc',
          KycDocumentType.GOVERNMENT_ID,
          'image/jpeg',
        ),
      ).rejects.toThrow('This storage key does not belong to the requesting user');
    });

    it('deletes the object and throws when the declared mime does not match the content', async () => {
      const { service, storage } = buildHarness();
      const userId = randomUUID();

      await expect(
        service.confirmDocument(
          userId,
          `kyc-documents/${userId}/abc`,
          KycDocumentType.GOVERNMENT_ID,
          'image/png',
        ),
      ).rejects.toBeInstanceOf(KycDocumentMimeMismatchError);
      expect(storage.deleteObject).toHaveBeenCalledWith(`kyc-documents/${userId}/abc`);
    });

    it('persists the document, unlinked to any verification, on success', async () => {
      const { service, documentsSave } = buildHarness();
      const userId = randomUUID();

      const document = await service.confirmDocument(
        userId,
        `kyc-documents/${userId}/abc`,
        KycDocumentType.GOVERNMENT_ID,
        'image/jpeg',
      );

      expect(document.verificationId).toBeNull();
      expect(documentsSave).toHaveBeenCalledWith(
        expect.objectContaining({ userId, verificationId: null, documentType: KycDocumentType.GOVERNMENT_ID }),
      );
    });
  });

  describe('submitManual', () => {
    it('refuses to submit when one or more documents cannot be found for this user', async () => {
      const { service, users, documentsFind } = buildHarness();
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);
      documentsFind.mockResolvedValue([{ id: 'doc-1' }]);

      await expect(
        service.submitManual(user.id, KycTier.TIER_1, ['doc-1', 'doc-2']),
      ).rejects.toBeInstanceOf(MissingKycDocumentsError);
    });

    it('creates a PENDING verification, links the documents, and records a SUBMITTED event', async () => {
      const { service, users, documentsFind, managerSave, managerUpdate } = buildHarness();
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);
      documentsFind.mockResolvedValue([{ id: 'doc-1' }, { id: 'doc-2' }]);

      const verification = await service.submitManual(user.id, KycTier.TIER_1, ['doc-1', 'doc-2']);

      expect(verification.status).toBe(KycVerificationStatus.PENDING);
      expect(verification.provider).toBe('manual');
      expect(managerUpdate).toHaveBeenCalledWith(
        KycDocument,
        { id: expect.objectContaining({ value: ['doc-1', 'doc-2'] }) as unknown },
        { verificationId: verification.id },
      );
      const eventCall = (
        managerSave.mock.calls as Array<[unknown, Record<string, unknown>]>
      ).find(([entity]) => entity === KycEvent);
      expect(eventCall?.[1]).toEqual(
        expect.objectContaining({ type: KycEventType.SUBMITTED, previousTier: KycTier.TIER_0 }),
      );
    });

    it('refuses to submit when verification is disabled', async () => {
      const { service, users, documentsFind } = buildHarness(false);
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);
      documentsFind.mockResolvedValue([{ id: 'doc-1' }]);

      await expect(service.submitManual(user.id, KycTier.TIER_1, ['doc-1'])).rejects.toBeInstanceOf(
        VerificationDisabledError,
      );
    });
  });

  describe('approveVerification / rejectVerification', () => {
    it('approves a PENDING verification, grants the tier, and records an event', async () => {
      const { service, users, verifications, events } = buildHarness();
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);
      const verification = await verifications.save(
        buildVerification({ userId: user.id, requestedTier: KycTier.TIER_2 }),
      );

      const result = await service.approveVerification(verification.id);

      expect(result.status).toBe(KycVerificationStatus.APPROVED);
      expect(await service.getTier(user.id)).toBe(KycTier.TIER_2);
      const approvedEvent = events.rows.find((event) => event.type === KycEventType.APPROVED);
      expect(approvedEvent?.newTier).toBe(KycTier.TIER_2);
    });

    it('rejects a PENDING verification without granting the tier', async () => {
      const { service, users, verifications, events } = buildHarness();
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);
      const verification = await verifications.save(
        buildVerification({ userId: user.id, requestedTier: KycTier.TIER_2 }),
      );

      const result = await service.rejectVerification(verification.id);

      expect(result.status).toBe(KycVerificationStatus.REJECTED);
      expect(await service.getTier(user.id)).toBe(KycTier.TIER_0);
      const rejectedEvent = events.rows.find((event) => event.type === KycEventType.REJECTED);
      expect(rejectedEvent?.newTier).toBeNull();
    });

    it('refuses to review a verification that already has a decision', async () => {
      const { service, users, verifications } = buildHarness();
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);
      const verification = await verifications.save(
        buildVerification({ userId: user.id, status: KycVerificationStatus.APPROVED }),
      );

      await expect(service.approveVerification(verification.id)).rejects.toBeInstanceOf(
        KycVerificationNotPendingError,
      );
      await expect(service.rejectVerification(verification.id)).rejects.toBeInstanceOf(
        KycVerificationNotPendingError,
      );
    });

    it('throws for an unknown verification id', async () => {
      const { service } = buildHarness();

      await expect(service.approveVerification(randomUUID())).rejects.toBeInstanceOf(
        UnknownKycVerificationError,
      );
    });
  });

  describe('listDocuments', () => {
    it('returns each document with a presigned download url', async () => {
      const { service, documentsFind, storage } = buildHarness();
      documentsFind.mockResolvedValue([{ id: 'doc-1', storageKey: 'kyc-documents/u/doc-1' }]);

      const result = await service.listDocuments('verification-1');

      expect(result).toEqual([
        { document: { id: 'doc-1', storageKey: 'kyc-documents/u/doc-1' }, url: 'https://storage.test/download' },
      ]);
      expect(storage.getPresignedDownloadUrl).toHaveBeenCalledWith('kyc-documents/u/doc-1');
    });
  });
});
