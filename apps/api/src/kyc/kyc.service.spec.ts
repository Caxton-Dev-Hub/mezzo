import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { KycService } from './kyc.service';
import { KycCapsService } from './kyc-caps.service';
import { KycTier } from './entities/kyc-tier.enum';
import { KycVerificationStatus } from './entities/kyc-verification-status.enum';
import { KycEventType } from './entities/kyc-event-type.enum';
import { KycProvider } from './providers/kyc-provider.interface';
import { KycTierRequiredError } from './errors/kyc-tier-required.error';
import { TransactionCapExceededError } from './errors/transaction-cap-exceeded.error';
import { UnknownKycVerificationError } from './errors/unknown-kyc-verification.error';
import { Money } from '../common/money/money';
import { User } from '../database/entities/user.entity';
import { KycVerification } from '../database/entities/kyc-verification.entity';
import { KycEvent } from '../database/entities/kyc-event.entity';
import { UserRole } from '../users/entities/user-role.enum';

class InMemoryUserRepository {
  constructor(readonly users: Map<string, User>) { }

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
    where: { providerReference?: string; userId?: string };
    order?: { createdAt: 'DESC' | 'ASC' };
  }): Promise<KycVerification | null> {
    let candidates = this.rows;
    if (where.providerReference) {
      candidates = candidates.filter((row) => row.providerReference === where.providerReference);
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

class StubKycProvider implements KycProvider {
  readonly name = 'FAKE';
  private counter = 0;

  submit(): Promise<{ providerReference: string }> {
    this.counter += 1;
    return Promise.resolve({ providerReference: `stub-ref-${this.counter}` });
  }
}

function buildUser(tier: KycTier): User {
  return {
    id: randomUUID(),
    email: `${randomUUID()}@example.com`,
    passwordHash: 'irrelevant',
    phone: null,
    role: UserRole.USER,
    kycTier: tier,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildHarness(): {
  service: KycService;
  users: InMemoryUserRepository;
  verifications: InMemoryVerificationRepository;
  events: InMemoryEventRepository;
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
  const provider = new StubKycProvider();

  const service = new KycService(
    users as unknown as Repository<User>,
    verifications as unknown as Repository<KycVerification>,
    events as unknown as Repository<KycEvent>,
    provider,
    caps,
  );

  return { service, users, verifications, events };
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

  describe('submit', () => {
    it('creates a PENDING verification and a SUBMITTED audit event', async () => {
      const { service, users, verifications, events } = buildHarness();
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);

      const verification = await service.submit(user.id, KycTier.TIER_1);

      expect(verification.status).toBe(KycVerificationStatus.PENDING);
      expect(verifications.rows).toHaveLength(1);
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].type).toBe(KycEventType.SUBMITTED);
      expect(events.rows[0].previousTier).toBe(KycTier.TIER_0);
      expect(events.rows[0].newTier).toBeNull();
    });
  });

  describe('handleProviderCallback', () => {
    it('grants the requested tier on approval and records an audit event', async () => {
      const { service, users, events } = buildHarness();
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);
      const verification = await service.submit(user.id, KycTier.TIER_1);

      const result = await service.handleProviderCallback({
        providerReference: verification.providerReference,
        status: 'APPROVED',
      });

      expect(result.status).toBe(KycVerificationStatus.APPROVED);
      expect(await service.getTier(user.id)).toBe(KycTier.TIER_1);
      const approvedEvent = events.rows.find((event) => event.type === KycEventType.APPROVED);
      expect(approvedEvent?.previousTier).toBe(KycTier.TIER_0);
      expect(approvedEvent?.newTier).toBe(KycTier.TIER_1);
    });

    it('does not raise the tier on rejection, but records it as auditable', async () => {
      const { service, users, events } = buildHarness();
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);
      const verification = await service.submit(user.id, KycTier.TIER_1);

      const result = await service.handleProviderCallback({
        providerReference: verification.providerReference,
        status: 'REJECTED',
      });

      expect(result.status).toBe(KycVerificationStatus.REJECTED);
      expect(await service.getTier(user.id)).toBe(KycTier.TIER_0);
      const rejectedEvent = events.rows.find((event) => event.type === KycEventType.REJECTED);
      expect(rejectedEvent).toBeDefined();
      expect(rejectedEvent?.newTier).toBeNull();
    });

    it('does not raise the tier on expiry, and records it as auditable', async () => {
      const { service, users, events } = buildHarness();
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);
      const verification = await service.submit(user.id, KycTier.TIER_1);

      const result = await service.handleProviderCallback({
        providerReference: verification.providerReference,
        status: 'EXPIRED',
      });

      expect(result.status).toBe(KycVerificationStatus.EXPIRED);
      expect(await service.getTier(user.id)).toBe(KycTier.TIER_0);
      expect(events.rows.some((event) => event.type === KycEventType.EXPIRED)).toBe(true);
    });

    it('is idempotent: replaying the same callback does not double-grant or duplicate events', async () => {
      const { service, users, events } = buildHarness();
      const user = buildUser(KycTier.TIER_0);
      await users.save(user);
      const verification = await service.submit(user.id, KycTier.TIER_1);

      const payload = { providerReference: verification.providerReference, status: 'APPROVED' as const };
      await service.handleProviderCallback(payload);
      const eventCountAfterFirst = events.rows.length;

      const replayed = await service.handleProviderCallback(payload);

      expect(replayed.status).toBe(KycVerificationStatus.APPROVED);
      expect(events.rows).toHaveLength(eventCountAfterFirst);
      expect(await service.getTier(user.id)).toBe(KycTier.TIER_1);
    });

    it('throws for an unknown provider reference', async () => {
      const { service } = buildHarness();

      await expect(
        service.handleProviderCallback({ providerReference: 'does-not-exist', status: 'APPROVED' }),
      ).rejects.toBeInstanceOf(UnknownKycVerificationError);
    });
  });
});
