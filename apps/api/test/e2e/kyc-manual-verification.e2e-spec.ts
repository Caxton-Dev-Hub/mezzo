import type { Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { User } from '../../src/database/entities/user.entity';
import { UserRole } from '../../src/users/entities/user-role.enum';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { RedisService } from '../../src/redis/redis.service';

interface AuthTokensBody {
  accessToken: string;
  user: { id: string };
}

interface PresignBody {
  uploadUrl: string;
  key: string;
}

interface KycDocumentBody {
  id: string;
}

interface KycVerificationBody {
  id: string;
  status: string;
}

interface AdminKycDocumentBody {
  id: string;
  url: string;
}

interface AdminKycVerificationBody {
  id: string;
  userId: string;
  status: string;
  documents: AdminKycDocumentBody[];
}

interface KycStatusBody {
  tier: KycTier;
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

const fixturesDir = join(__dirname, '..', 'fixtures', 'evidence');

function readFixture(name: string): Buffer {
  return readFileSync(join(fixturesDir, name));
}

describe('KYC manual verification (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let users: Repository<User>;
  let redis: RedisService;
  let userCounter = 0;

  const password = 'super-secret-password';

  function uniqueEmail(): string {
    userCounter += 1;
    return `kyc-manual-user-${Date.now()}-${userCounter}@example.com`;
  }

  function auth(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
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

  async function uploadDocument(
    accessToken: string,
    documentType: 'GOVERNMENT_ID' | 'SELFIE',
    fixtureName: string,
  ): Promise<string> {
    const presignResponse = await request(server)
      .post('/kyc/documents/presign')
      .set(auth(accessToken))
      .send({ documentType, mimeType: 'image/jpeg' });
    const presign = presignResponse.body as PresignBody;

    const buffer = readFixture(fixtureName);
    const putResponse = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: buffer,
    });
    expect(putResponse.status).toBe(200);

    const confirmResponse = await request(server)
      .post('/kyc/documents/confirm')
      .set(auth(accessToken))
      .send({ key: presign.key, documentType, declaredMime: 'image/jpeg' });
    expect(confirmResponse.status).toBe(201);

    return (confirmResponse.body as KycDocumentBody).id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    redis = app.get(RedisService);
    users = app.get<Repository<User>>(getRepositoryToken(User));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('lets a buyer submit documents for manual review, and an admin approve', async () => {
    const buyer = await registerAndLogin();
    const admin = await registerAndLogin(UserRole.ADMIN);

    const governmentIdId = await uploadDocument(
      buyer.accessToken,
      'GOVERNMENT_ID',
      'with-exif.jpg',
    );
    const selfieId = await uploadDocument(buyer.accessToken, 'SELFIE', 'without-exif.jpg');

    const submitResponse = await request(server)
      .post('/kyc/manual-submissions')
      .set(auth(buyer.accessToken))
      .send({ tier: 'TIER_2', documentIds: [governmentIdId, selfieId] });
    expect(submitResponse.status).toBe(201);
    const verification = submitResponse.body as KycVerificationBody;
    expect(verification.status).toBe('PENDING');

    const statusBeforeApproval = await request(server).get('/kyc/me').set(auth(buyer.accessToken));
    expect((statusBeforeApproval.body as KycStatusBody).tier).toBe('TIER_0');

    const queueResponse = await request(server)
      .get('/admin/kyc/queue?status=PENDING')
      .set(auth(admin.accessToken));
    expect(queueResponse.status).toBe(200);
    const queued = (queueResponse.body as AdminKycVerificationBody[]).find(
      (row) => row.id === verification.id,
    );
    expect(queued).toBeDefined();
    expect(queued?.documents).toHaveLength(2);
    expect(queued?.documents[0].url).toEqual(expect.stringContaining('http'));

    const approveResponse = await request(server)
      .post(`/admin/kyc/verifications/${verification.id}/approve`)
      .set(auth(admin.accessToken))
      .send({ reason: 'Documents check out' });
    expect(approveResponse.status).toBe(200);

    const statusAfterApproval = await request(server).get('/kyc/me').set(auth(buyer.accessToken));
    expect((statusAfterApproval.body as KycStatusBody).tier).toBe('TIER_2');
  });

  it('leaves the tier untouched on rejection', async () => {
    const buyer = await registerAndLogin();
    const admin = await registerAndLogin(UserRole.ADMIN);
    const documentId = await uploadDocument(buyer.accessToken, 'GOVERNMENT_ID', 'with-exif.jpg');

    const submitResponse = await request(server)
      .post('/kyc/manual-submissions')
      .set(auth(buyer.accessToken))
      .send({ tier: 'TIER_1', documentIds: [documentId] });
    const verification = submitResponse.body as KycVerificationBody;

    const rejectResponse = await request(server)
      .post(`/admin/kyc/verifications/${verification.id}/reject`)
      .set(auth(admin.accessToken))
      .send({ reason: 'Photo is illegible' });
    expect(rejectResponse.status).toBe(200);

    const status = await request(server).get('/kyc/me').set(auth(buyer.accessToken));
    expect((status.body as KycStatusBody).tier).toBe('TIER_0');
  });

  it('refuses to submit when a document does not belong to the caller', async () => {
    const buyer = await registerAndLogin();
    const stranger = await registerAndLogin();
    const documentId = await uploadDocument(buyer.accessToken, 'GOVERNMENT_ID', 'with-exif.jpg');

    const response = await request(server)
      .post('/kyc/manual-submissions')
      .set(auth(stranger.accessToken))
      .send({ tier: 'TIER_1', documentIds: [documentId] });

    expect(response.status).toBe(422);
    expect((response.body as ErrorBody).code).toBe('MISSING_KYC_DOCUMENTS');
  });

  it('refuses a non-admin trying to approve or reject a verification', async () => {
    const buyer = await registerAndLogin();
    const documentId = await uploadDocument(buyer.accessToken, 'GOVERNMENT_ID', 'with-exif.jpg');
    const submitResponse = await request(server)
      .post('/kyc/manual-submissions')
      .set(auth(buyer.accessToken))
      .send({ tier: 'TIER_1', documentIds: [documentId] });
    const verification = submitResponse.body as KycVerificationBody;

    const response = await request(server)
      .post(`/admin/kyc/verifications/${verification.id}/approve`)
      .set(auth(buyer.accessToken))
      .send({ reason: 'trying anyway' });

    expect(response.status).toBe(403);
  });

  it('refuses to review the same verification twice', async () => {
    const buyer = await registerAndLogin();
    const admin = await registerAndLogin(UserRole.ADMIN);
    const documentId = await uploadDocument(buyer.accessToken, 'GOVERNMENT_ID', 'with-exif.jpg');
    const submitResponse = await request(server)
      .post('/kyc/manual-submissions')
      .set(auth(buyer.accessToken))
      .send({ tier: 'TIER_1', documentIds: [documentId] });
    const verification = submitResponse.body as KycVerificationBody;

    await request(server)
      .post(`/admin/kyc/verifications/${verification.id}/approve`)
      .set(auth(admin.accessToken))
      .send({ reason: 'first pass' });

    const secondAttempt = await request(server)
      .post(`/admin/kyc/verifications/${verification.id}/approve`)
      .set(auth(admin.accessToken))
      .send({ reason: 'second pass' });

    expect(secondAttempt.status).toBe(409);
    expect((secondAttempt.body as ErrorBody).code).toBe('KYC_VERIFICATION_NOT_PENDING');
  });
});
