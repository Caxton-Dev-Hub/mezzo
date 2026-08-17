import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { User } from '../../src/database/entities/user.entity';
import { PlatformFlag } from '../../src/database/entities/platform-flag.entity';
import { AuditEvent } from '../../src/database/entities/audit-event.entity';
import { UserRole } from '../../src/users/entities/user-role.enum';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { VERIFICATION_FLAG_KEY } from '../../src/settings/platform-flag-key';
import { RedisService } from '../../src/redis/redis.service';

interface AuthTokensBody {
  accessToken: string;
  user: { id: string };
}

interface KycStatusBody {
  tier: KycTier;
  verificationEnabled: boolean;
}

interface PlatformSettingsBody {
  verificationEnabled: boolean;
  updatedById: string | null;
}

describe('Verification availability toggle (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let users: Repository<User>;
  let flags: Repository<PlatformFlag>;
  let auditEvents: Repository<AuditEvent>;
  let redis: RedisService;
  let emailCounter = 0;

  const password = 'super-secret-password';

  function uniqueEmail(): string {
    emailCounter += 1;
    return `verification-toggle-${Date.now()}-${emailCounter}@example.com`;
  }

  function auth(accessToken: string): { Authorization: string } {
    return { Authorization: `Bearer ${accessToken}` };
  }

  async function registerAndLogin(
    role: UserRole = UserRole.USER,
  ): Promise<{ userId: string; accessToken: string }> {
    const email = uniqueEmail();
    await request(server).post('/auth/register').send({ email, password });
    await users.update({ email }, { emailVerifiedAt: new Date() });
    if (role !== UserRole.USER) {
      await users.update({ email }, { role });
    }
    const loginResponse = await request(server).post('/auth/login').send({ email, password });
    const body = loginResponse.body as AuthTokensBody;
    return { userId: body.user.id, accessToken: body.accessToken };
  }

  async function setVerification(accessToken: string, enabled: boolean, reason: string) {
    return request(server)
      .post('/admin/settings/verification')
      .set(auth(accessToken))
      .send({ enabled, reason });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    users = app.get<Repository<User>>(getRepositoryToken(User));
    flags = app.get<Repository<PlatformFlag>>(getRepositoryToken(PlatformFlag));
    auditEvents = app.get<Repository<AuditEvent>>(getRepositoryToken(AuditEvent));
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
    await flags.delete({ key: VERIFICATION_FLAG_KEY });
  });

  it('defaults to verification being live', async () => {
    const user = await registerAndLogin();

    const response = await request(server).get('/kyc/me').set(auth(user.accessToken));

    expect(response.status).toBe(200);
    expect((response.body as KycStatusBody).verificationEnabled).toBe(true);
  });

  it('refuses to let a non-admin change the setting', async () => {
    const user = await registerAndLogin();

    const response = await setVerification(user.accessToken, false, 'Not my call');

    expect(response.status).toBe(403);
  });

  it('turns verification into coming soon and tells every user through /kyc/me', async () => {
    const admin = await registerAndLogin(UserRole.ADMIN);
    const user = await registerAndLogin();

    const toggleResponse = await setVerification(admin.accessToken, false, 'Provider not live yet');

    expect(toggleResponse.status).toBe(200);
    expect((toggleResponse.body as PlatformSettingsBody).verificationEnabled).toBe(false);
    expect((toggleResponse.body as PlatformSettingsBody).updatedById).toBe(admin.userId);

    const statusResponse = await request(server).get('/kyc/me').set(auth(user.accessToken));
    expect((statusResponse.body as KycStatusBody).verificationEnabled).toBe(false);
  });

  it('closes submissions while verification is coming soon', async () => {
    const admin = await registerAndLogin(UserRole.ADMIN);
    const user = await registerAndLogin();

    await setVerification(admin.accessToken, false, 'Provider not live yet');

    const response = await request(server)
      .post('/kyc/submissions')
      .set(auth(user.accessToken))
      .send({ tier: KycTier.TIER_1 });

    expect(response.status).toBe(409);
    expect((response.body as { code: string }).code).toBe('VERIFICATION_DISABLED');
  });

  it('lets a TIER_0 user reach a tier-gated endpoint while verification is coming soon', async () => {
    const admin = await registerAndLogin(UserRole.ADMIN);
    const user = await registerAndLogin();

    const blocked = await request(server).get('/payouts').set(auth(user.accessToken)).send();
    expect(blocked.status).toBe(200);

    const blockedPayout = await request(server)
      .post('/payouts')
      .set(auth(user.accessToken))
      .send({
        amount: { amount: 100_000, currency: 'NGN' },
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
      });
    expect(blockedPayout.status).toBe(403);
    expect((blockedPayout.body as { code: string }).code).toBe('KYC_TIER_REQUIRED');

    await setVerification(admin.accessToken, false, 'Provider not live yet');

    const afterToggle = await request(server)
      .post('/payouts')
      .set(auth(user.accessToken))
      .send({
        amount: { amount: 100_000, currency: 'NGN' },
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
      });

    expect(afterToggle.status).not.toBe(403);
    expect((afterToggle.body as { code?: string }).code).not.toBe('KYC_TIER_REQUIRED');
  });

  it('records who changed the setting and why', async () => {
    const admin = await registerAndLogin(UserRole.ADMIN);

    await setVerification(admin.accessToken, false, 'Dojah contract not signed');

    const events = await auditEvents.find({
      where: { entityType: 'platform_flag', entityId: VERIFICATION_FLAG_KEY },
      order: { createdAt: 'DESC' },
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].actorId).toBe(admin.userId);
    expect(events[0].action).toBe('VERIFICATION_AVAILABILITY_CHANGED');
    expect(events[0].reason).toBe('Dojah contract not signed');
    expect(events[0].afterState).toEqual({ verificationEnabled: false });
  });

  it('restores enforcement when an admin turns verification back on', async () => {
    const admin = await registerAndLogin(UserRole.ADMIN);
    const user = await registerAndLogin();

    await setVerification(admin.accessToken, false, 'Provider not live yet');
    await setVerification(admin.accessToken, true, 'Provider is live');

    const statusResponse = await request(server).get('/kyc/me').set(auth(user.accessToken));
    expect((statusResponse.body as KycStatusBody).verificationEnabled).toBe(true);

    const payoutResponse = await request(server)
      .post('/payouts')
      .set(auth(user.accessToken))
      .send({
        amount: { amount: 100_000, currency: 'NGN' },
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
      });

    expect(payoutResponse.status).toBe(403);
    expect((payoutResponse.body as { code: string }).code).toBe('KYC_TIER_REQUIRED');
  });
});
