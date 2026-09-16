import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { User } from '../../src/database/entities/user.entity';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { RedisService } from '../../src/redis/redis.service';

interface AuthTokensBody {
  accessToken: string;
  refreshToken: string;
}

interface KycStatusBody {
  tier: KycTier;
  latestVerification: unknown;
}

describe('KYC (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let users: Repository<User>;
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
    await users.update({ email }, { emailVerifiedAt: new Date() });
    const loginResponse = await request(server).post('/auth/login').send({ email, password });
    const body = loginResponse.body as AuthTokensBody;
    return { email, accessToken: body.accessToken };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    users = app.get<Repository<User>>(getRepositoryToken(User));
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

    const response = await request(server)
      .get('/kyc/me')
      .set('Authorization', `Bearer ${accessToken}`);
    const status = response.body as KycStatusBody;

    expect(status.tier).toBe(KycTier.TIER_0);
    expect(status.latestVerification).toBeNull();
  });

  it('rejects submitting a TIER_0 application', async () => {
    const { accessToken } = await registerAndLogin();

    const response = await request(server)
      .post('/kyc/manual-submissions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tier: KycTier.TIER_0, documentIds: [randomUUID()] });

    expect(response.status).toBe(400);
  });

  it('requires authentication to submit', async () => {
    const response = await request(server)
      .post('/kyc/manual-submissions')
      .send({ tier: KycTier.TIER_1, documentIds: [randomUUID()] });

    expect(response.status).toBe(401);
  });

  it('exposes no self-serve provider submission or unauthenticated approval webhook', async () => {
    const { accessToken } = await registerAndLogin();

    const submission = await request(server)
      .post('/kyc/submissions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tier: KycTier.TIER_1 });
    const webhook = await request(server)
      .post('/kyc/webhook')
      .send({ providerReference: 'any-reference', status: 'APPROVED' });

    expect(submission.status).toBe(404);
    expect(webhook.status).toBe(404);
  });
});
