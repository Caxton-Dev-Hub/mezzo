import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { KycEvent } from '../../src/database/entities/kyc-event.entity';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { KycEventType } from '../../src/kyc/entities/kyc-event-type.enum';
import { RedisService } from '../../src/redis/redis.service';

interface AuthTokensBody {
  accessToken: string;
  refreshToken: string;
}

interface KycVerificationBody {
  id: string;
  status: string;
  requestedTier: string;
  providerReference: string;
}

interface KycStatusBody {
  tier: KycTier;
  latestVerification: KycVerificationBody | null;
}

describe('KYC (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let kycEvents: Repository<KycEvent>;
  let redis: RedisService;
  let emailCounter = 0;

  const password = 'super-secret-password';

  function uniqueEmail(): string {
    emailCounter += 1;
    return `kyc-user-${Date.now()}-${emailCounter}@example.com`;
  }

  async function registerAndLogin(): Promise<{ email: string; accessToken: string }> {
    const email = uniqueEmail();
    await request(server).post('/auth/register').send({ email, password });
    const loginResponse = await request(server).post('/auth/login').send({ email, password });
    const body = loginResponse.body as AuthTokensBody;
    return { email, accessToken: body.accessToken };
  }

  async function submitTier1(accessToken: string): Promise<KycVerificationBody> {
    const response = await request(server)
      .post('/kyc/submissions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tier: KycTier.TIER_1 });
    return response.body as KycVerificationBody;
  }

  async function getStatus(accessToken: string): Promise<KycStatusBody> {
    const response = await request(server)
      .get('/kyc/me')
      .set('Authorization', `Bearer ${accessToken}`);
    return response.body as KycStatusBody;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    kycEvents = app.get<Repository<KycEvent>>(getRepositoryToken(KycEvent));
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('starts a fresh user at TIER_0', async () => {
    const { accessToken } = await registerAndLogin();

    const status = await getStatus(accessToken);

    expect(status.tier).toBe(KycTier.TIER_0);
    expect(status.latestVerification).toBeNull();
  });

  it('rejects submitting a TIER_0 application', async () => {
    const { accessToken } = await registerAndLogin();

    const response = await request(server)
      .post('/kyc/submissions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tier: KycTier.TIER_0 });

    expect(response.status).toBe(400);
  });

  it('requires authentication to submit', async () => {
    const response = await request(server).post('/kyc/submissions').send({ tier: KycTier.TIER_1 });
    expect(response.status).toBe(401);
  });

  it('transitions PENDING via submission and grants the tier once the provider webhook approves', async () => {
    const { accessToken } = await registerAndLogin();

    const submitted = await submitTier1(accessToken);
    expect(submitted.status).toBe('PENDING');
    expect((await getStatus(accessToken)).tier).toBe(KycTier.TIER_0);

    const webhookResponse = await request(server)
      .post('/kyc/webhook')
      .send({ providerReference: submitted.providerReference, status: 'APPROVED' });

    expect(webhookResponse.status).toBe(200);
    expect((webhookResponse.body as KycVerificationBody).status).toBe('APPROVED');
    expect((await getStatus(accessToken)).tier).toBe(KycTier.TIER_1);
  });

  it('does not raise the tier on rejection, but the rejection is auditable', async () => {
    const { accessToken } = await registerAndLogin();
    const submitted = await submitTier1(accessToken);

    const webhookResponse = await request(server)
      .post('/kyc/webhook')
      .send({ providerReference: submitted.providerReference, status: 'REJECTED' });

    expect(webhookResponse.status).toBe(200);
    expect((await getStatus(accessToken)).tier).toBe(KycTier.TIER_0);

    const events = await kycEvents.find({ where: { providerReference: submitted.providerReference } });
    expect(events.some((event) => event.type === KycEventType.REJECTED)).toBe(true);
  });

  it('is idempotent on webhook replay: does not double-grant or duplicate audit events', async () => {
    const { accessToken } = await registerAndLogin();
    const submitted = await submitTier1(accessToken);

    const payload = { providerReference: submitted.providerReference, status: 'APPROVED' as const };
    await request(server).post('/kyc/webhook').send(payload);
    const eventsAfterFirst = await kycEvents.find({
      where: { providerReference: submitted.providerReference },
    });

    const replay = await request(server).post('/kyc/webhook').send(payload);
    const eventsAfterReplay = await kycEvents.find({
      where: { providerReference: submitted.providerReference },
    });

    expect(replay.status).toBe(200);
    expect(eventsAfterReplay).toHaveLength(eventsAfterFirst.length);
    expect((await getStatus(accessToken)).tier).toBe(KycTier.TIER_1);
  });

  it('rejects a webhook for an unknown provider reference', async () => {
    const response = await request(server)
      .post('/kyc/webhook')
      .send({ providerReference: 'does-not-exist', status: 'APPROVED' });

    expect(response.status).toBe(404);
  });
});
