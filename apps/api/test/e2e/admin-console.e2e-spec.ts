import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { User } from '../../src/database/entities/user.entity';
import { UserRole } from '../../src/users/entities/user-role.enum';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { KycVerificationStatus } from '../../src/kyc/entities/kyc-verification-status.enum';
import { LedgerService } from '../../src/ledger/ledger.service';
import { EntryDirection } from '../../src/ledger/entities/entry-direction.enum';
import { treasuryRef, userWalletRef } from '../../src/ledger/account-refs';
import { Money } from '../../src/common/money/money';
import { RedisService } from '../../src/redis/redis.service';

interface AuthTokensBody {
  accessToken: string;
  user: { id: string };
}

interface LedgerEntryBody {
  id: string;
  direction: string;
  amount: number;
  currency: string;
}

interface AdminUserBody {
  id: string;
  email: string;
  role: UserRole;
  kycTier: KycTier;
}

interface KycVerificationBody {
  id: string;
  userId: string;
  status: KycVerificationStatus;
}

describe('Admin console (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let users: Repository<User>;
  let ledger: LedgerService;
  let redis: RedisService;
  let userCounter = 0;

  const password = 'super-secret-password';

  function uniqueEmail(): string {
    userCounter += 1;
    return `admin-console-${Date.now()}-${userCounter}@example.com`;
  }

  function auth(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  async function registerAndLogin(
    role: UserRole = UserRole.USER,
  ): Promise<{ userId: string; accessToken: string; email: string }> {
    const email = uniqueEmail();
    await request(server).post('/auth/register').send({ email, password });
    await users.update({ email }, { emailVerifiedAt: new Date() });
    if (role !== UserRole.USER) {
      await users.update({ email }, { role });
    }
    const loginResponse = await request(server).post('/auth/login').send({ email, password });
    const body = loginResponse.body as AuthTokensBody;
    return { userId: body.user.id, accessToken: body.accessToken, email };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    server = app.getHttpServer() as Server;
    users = app.get<Repository<User>>(getRepositoryToken(User));
    ledger = app.get(LedgerService);
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  describe('GET /admin/users', () => {
    it('lists users for an admin without exposing password hashes', async () => {
      const admin = await registerAndLogin(UserRole.ADMIN);

      const response = await request(server).get('/admin/users').set(auth(admin.accessToken));

      expect(response.status).toBe(200);
      const body = response.body as AdminUserBody[];
      expect(body.length).toBeGreaterThan(0);
      expect(body.some((user) => user.email === admin.email)).toBe(true);
      expect(JSON.stringify(body)).not.toContain('passwordHash');
    });

    it('denies a plain user', async () => {
      const user = await registerAndLogin();

      const response = await request(server).get('/admin/users').set(auth(user.accessToken));

      expect(response.status).toBe(403);
    });
  });

  describe('GET /admin/ledger/entries', () => {
    it('returns the entries of an account by its ref, newest first', async () => {
      const admin = await registerAndLogin(UserRole.ADMIN);
      const holder = await registerAndLogin();
      const ref = userWalletRef(holder.userId);

      await ledger.postTransaction(
        [
          {
            accountRef: treasuryRef(),
            direction: EntryDirection.DEBIT,
            money: Money.of(7_500, 'NGN'),
          },
          { accountRef: ref, direction: EntryDirection.CREDIT, money: Money.of(7_500, 'NGN') },
        ],
        { idempotencyKey: `admin-console-seed:${randomUUID()}` },
      );

      const response = await request(server)
        .get('/admin/ledger/entries')
        .query({ accountRef: ref })
        .set(auth(admin.accessToken));

      expect(response.status).toBe(200);
      const entries = response.body as LedgerEntryBody[];
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(
        expect.objectContaining({
          direction: EntryDirection.CREDIT,
          amount: 7_500,
          currency: 'NGN',
        }),
      );
    });

    it('returns 404 for an account ref that has never been opened', async () => {
      const admin = await registerAndLogin(UserRole.ADMIN);

      const response = await request(server)
        .get('/admin/ledger/entries')
        .query({ accountRef: userWalletRef(randomUUID()) })
        .set(auth(admin.accessToken));

      expect(response.status).toBe(404);
    });

    it('denies a plain user', async () => {
      const user = await registerAndLogin();

      const response = await request(server)
        .get('/admin/ledger/entries')
        .query({ accountRef: userWalletRef(user.userId) })
        .set(auth(user.accessToken));

      expect(response.status).toBe(403);
    });
  });

  describe('GET /admin/kyc/queue', () => {
    it('lists submitted verifications for an admin', async () => {
      const admin = await registerAndLogin(UserRole.ADMIN);
      const applicant = await registerAndLogin();

      await request(server)
        .post('/kyc/submissions')
        .set(auth(applicant.accessToken))
        .send({ tier: KycTier.TIER_1 });

      const response = await request(server).get('/admin/kyc/queue').set(auth(admin.accessToken));

      expect(response.status).toBe(200);
      const queue = response.body as KycVerificationBody[];
      expect(queue.some((row) => row.userId === applicant.userId)).toBe(true);
    });

    it('denies a plain user', async () => {
      const user = await registerAndLogin();

      const response = await request(server).get('/admin/kyc/queue').set(auth(user.accessToken));

      expect(response.status).toBe(403);
    });
  });

  describe('POST /admin/kyc/users/:userId/tier', () => {
    it('raises a tier by hand and records both sides in the audit log', async () => {
      const admin = await registerAndLogin(UserRole.ADMIN);
      const target = await registerAndLogin();

      const override = await request(server)
        .post(`/admin/kyc/users/${target.userId}/tier`)
        .set(auth(admin.accessToken))
        .send({ tier: KycTier.TIER_2, reason: 'Documents verified by hand' });

      expect(override.status).toBe(200);
      expect(override.body).toEqual({ before: KycTier.TIER_0, after: KycTier.TIER_2 });

      const stored = await users.findOne({ where: { id: target.userId } });
      expect(stored?.kycTier).toBe(KycTier.TIER_2);

      const audit = await request(server)
        .get('/admin/audit')
        .query({ entityType: 'user', entityId: target.userId })
        .set(auth(admin.accessToken));

      expect(audit.status).toBe(200);
      expect(audit.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'KYC_TIER_OVERRIDE',
            actorId: admin.userId,
            reason: 'Documents verified by hand',
          }),
        ]),
      );
    });

    it('denies a plain user, leaving the tier untouched', async () => {
      const attacker = await registerAndLogin();
      const target = await registerAndLogin();

      const response = await request(server)
        .post(`/admin/kyc/users/${target.userId}/tier`)
        .set(auth(attacker.accessToken))
        .send({ tier: KycTier.TIER_3, reason: 'Self service' });

      expect(response.status).toBe(403);
      const stored = await users.findOne({ where: { id: target.userId } });
      expect(stored?.kycTier).toBe(KycTier.TIER_0);
    });

    it('rejects an unknown tier value', async () => {
      const admin = await registerAndLogin(UserRole.ADMIN);
      const target = await registerAndLogin();

      const response = await request(server)
        .post(`/admin/kyc/users/${target.userId}/tier`)
        .set(auth(admin.accessToken))
        .send({ tier: 'TIER_9', reason: 'Typo' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /admin/disputes', () => {
    it('serves an empty list rather than failing when no dispute matches the filter', async () => {
      const admin = await registerAndLogin(UserRole.ADMIN);

      const response = await request(server)
        .get('/admin/disputes')
        .query({ state: 'OPEN' })
        .set(auth(admin.accessToken));

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('denies a plain user', async () => {
      const user = await registerAndLogin();

      const response = await request(server).get('/admin/disputes').set(auth(user.accessToken));

      expect(response.status).toBe(403);
    });
  });
});
