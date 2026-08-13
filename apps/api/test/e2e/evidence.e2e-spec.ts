import type { Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { EscrowRole } from '../../src/escrow/entities/escrow-role.enum';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { EvidenceFlagType } from '../../src/evidence/entities/evidence-flag-type.enum';
import { User } from '../../src/database/entities/user.entity';
import { RedisService } from '../../src/redis/redis.service';

interface AuthTokensBody {
  accessToken: string;
  user: { id: string };
}

interface EscrowDetailBody {
  id: string;
}

interface PresignBody {
  uploadUrl: string;
  key: string;
}

interface EvidenceItemBody {
  id: string;
  escrowId: string;
  uploaderId: string;
  phase: EvidencePhase;
  contentHash: string;
  declaredMime: string;
  detectedMime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  capturedAt: string | null;
  deviceMake: string | null;
  deviceModel: string | null;
  flags: EvidenceFlagType[];
  createdAt: string;
}

interface EvidenceBundleBody {
  escrowId: string;
  items: EvidenceItemBody[];
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const fixturesDir = join(__dirname, '..', 'fixtures', 'evidence');

function readFixture(name: string): Buffer {
  return readFileSync(join(fixturesDir, name));
}

describe('Evidence (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let redis: RedisService;
  let users: Repository<User>;
  let userCounter = 0;

  const password = 'super-secret-password';

  function uniqueEmail(): string {
    userCounter += 1;
    return `evidence-user-${Date.now()}-${userCounter}@example.com`;
  }

  function auth(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  async function registerAndLogin(): Promise<{ userId: string; accessToken: string }> {
    const email = uniqueEmail();
    await request(server).post('/auth/register').send({ email, password });
    await users.update({ email }, { emailVerifiedAt: new Date() });
    const loginResponse = await request(server).post('/auth/login').send({ email, password });
    const body = loginResponse.body as AuthTokensBody;
    return { userId: body.user.id, accessToken: body.accessToken };
  }

  async function createDraft(accessToken: string): Promise<string> {
    const response = await request(server)
      .post('/escrows')
      .set(auth(accessToken))
      .send({
        role: EscrowRole.BUYER,
        price: { amount: 100_000, currency: 'NGN' },
        inspectionWindowHours: 48,
        deliveryMethod: 'courier',
        itemDescription: 'A vintage camera',
        feeBps: 250,
      });
    return (response.body as EscrowDetailBody).id;
  }

  async function uploadBuffer(
    accessToken: string,
    escrowId: string,
    phase: EvidencePhase,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ status: number; body: EvidenceItemBody | ErrorBody }> {
    const presignResponse = await request(server)
      .post('/evidence/presign')
      .set(auth(accessToken))
      .send({ escrowId, phase, mimeType });
    const presign = presignResponse.body as PresignBody;

    const putResponse = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: buffer,
    });
    expect(putResponse.status).toBe(200);

    const confirmResponse = await request(server)
      .post('/evidence/confirm')
      .set(auth(accessToken))
      .send({ escrowId, phase, key: presign.key, declaredMime: mimeType });

    return {
      status: confirmResponse.status,
      body: confirmResponse.body as EvidenceItemBody | ErrorBody,
    };
  }

  async function uploadEvidence(
    accessToken: string,
    escrowId: string,
    phase: EvidencePhase,
    fixtureName: string,
    mimeType: string,
  ): Promise<{ status: number; body: EvidenceItemBody | ErrorBody }> {
    return uploadBuffer(accessToken, escrowId, phase, readFixture(fixtureName), mimeType);
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

  it('persists a correct SHA-256 hash and extracts EXIF when present', async () => {
    const buyer = await registerAndLogin();
    const escrowId = await createDraft(buyer.accessToken);

    const result = await uploadEvidence(
      buyer.accessToken,
      escrowId,
      EvidencePhase.AT_CREATION,
      'with-exif.jpg',
      'image/jpeg',
    );

    expect(result.status).toBe(201);
    const item = result.body as EvidenceItemBody;
    const expectedHash = createHash('sha256').update(readFixture('with-exif.jpg')).digest('hex');
    expect(item.contentHash).toBe(expectedHash);
    expect(item.capturedAt).not.toBeNull();
    expect(item.deviceMake).toBe('MezzoCam');
    expect(item.flags).not.toContain(EvidenceFlagType.MISSING_METADATA);
  });

  it('flags a re-upload of identical bytes as DUPLICATE_CONTENT without blocking it', async () => {
    // Dedup is global (reverse-dedup across escrows, by design), so this uses a
    // buffer unique to this test run rather than a shared fixture -- otherwise
    // a prior test uploading the same fixture bytes would make even the
    // "first" upload here carry the flag too.
    const buyer = await registerAndLogin();
    const escrowId = await createDraft(buyer.accessToken);
    const uniqueImage = Buffer.concat([
      readFixture('without-exif.jpg'),
      Buffer.from(`dedup-test-${Date.now()}-${Math.random()}`),
    ]);

    const first = await uploadBuffer(
      buyer.accessToken,
      escrowId,
      EvidencePhase.AT_CREATION,
      uniqueImage,
      'image/jpeg',
    );
    const second = await uploadBuffer(
      buyer.accessToken,
      escrowId,
      EvidencePhase.AT_CREATION,
      uniqueImage,
      'image/jpeg',
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstItem = first.body as EvidenceItemBody;
    const secondItem = second.body as EvidenceItemBody;
    expect(secondItem.contentHash).toBe(firstItem.contentHash);
    expect(secondItem.flags).toContain(EvidenceFlagType.DUPLICATE_CONTENT);
    expect(firstItem.flags).not.toContain(EvidenceFlagType.DUPLICATE_CONTENT);
  });

  it('flags an image with no EXIF as MISSING_METADATA without blocking the upload', async () => {
    const buyer = await registerAndLogin();
    const escrowId = await createDraft(buyer.accessToken);

    const result = await uploadEvidence(
      buyer.accessToken,
      escrowId,
      EvidencePhase.AT_CREATION,
      'without-exif.jpg',
      'image/jpeg',
    );

    expect(result.status).toBe(201);
    const item = result.body as EvidenceItemBody;
    expect(item.capturedAt).toBeNull();
    expect(item.flags).toContain(EvidenceFlagType.MISSING_METADATA);
  });

  it('flags an old EXIF capture timestamp as TIMESTAMP_MISMATCH', async () => {
    const buyer = await registerAndLogin();
    const escrowId = await createDraft(buyer.accessToken);

    const result = await uploadEvidence(
      buyer.accessToken,
      escrowId,
      EvidencePhase.AT_CREATION,
      'with-old-exif.jpg',
      'image/jpeg',
    );

    expect(result.status).toBe(201);
    const item = result.body as EvidenceItemBody;
    expect(item.flags).toContain(EvidenceFlagType.TIMESTAMP_MISMATCH);
  });

  it('rejects a file whose declared mime does not match the sniffed bytes', async () => {
    const buyer = await registerAndLogin();
    const escrowId = await createDraft(buyer.accessToken);

    const result = await uploadEvidence(
      buyer.accessToken,
      escrowId,
      EvidencePhase.AT_CREATION,
      'plain.png',
      'image/jpeg',
    );

    expect(result.status).toBe(422);
    expect((result.body as ErrorBody).code).toBe('MIME_MISMATCH');
  });

  it('rejects an unsupported declared mime type at the schema level', async () => {
    const buyer = await registerAndLogin();
    const escrowId = await createDraft(buyer.accessToken);

    const response = await request(server)
      .post('/evidence/presign')
      .set(auth(buyer.accessToken))
      .send({ escrowId, phase: EvidencePhase.AT_CREATION, mimeType: 'application/x-msdownload' });

    expect(response.status).toBe(400);
  });

  it('blocks presign, confirm, and bundle access for a non-party', async () => {
    const buyer = await registerAndLogin();
    const stranger = await registerAndLogin();
    const escrowId = await createDraft(buyer.accessToken);

    const presign = await request(server)
      .post('/evidence/presign')
      .set(auth(stranger.accessToken))
      .send({ escrowId, phase: EvidencePhase.AT_CREATION, mimeType: 'image/jpeg' });
    expect(presign.status).toBe(403);

    const bundle = await request(server)
      .get(`/evidence/${escrowId}`)
      .set(auth(stranger.accessToken));
    expect(bundle.status).toBe(403);
  });

  it('exposes no update or delete endpoint anywhere in the evidence surface', async () => {
    const buyer = await registerAndLogin();
    const escrowId = await createDraft(buyer.accessToken);
    const uploaded = await uploadEvidence(
      buyer.accessToken,
      escrowId,
      EvidencePhase.AT_CREATION,
      'with-exif.jpg',
      'image/jpeg',
    );
    const item = uploaded.body as EvidenceItemBody;

    const patchResponse = await request(server)
      .patch(`/evidence/${item.id}`)
      .set(auth(buyer.accessToken))
      .send({ phase: EvidencePhase.AT_DELIVERY });
    const putResponse = await request(server)
      .put(`/evidence/${item.id}`)
      .set(auth(buyer.accessToken))
      .send({});
    const deleteResponse = await request(server)
      .delete(`/evidence/${item.id}`)
      .set(auth(buyer.accessToken));

    expect(patchResponse.status).toBe(404);
    expect(putResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
  });

  it('blocks an escrow from leaving DRAFT with zero AT_CREATION evidence', async () => {
    const buyer = await registerAndLogin();
    const escrowId = await createDraft(buyer.accessToken);

    const inviteResponse = await request(server)
      .post(`/escrows/${escrowId}/invite`)
      .set(auth(buyer.accessToken));

    expect(inviteResponse.status).toBe(409);
    expect((inviteResponse.body as ErrorBody).code).toBe('MISSING_CREATION_EVIDENCE');
  });

  it('allows leaving DRAFT once at least one AT_CREATION photo exists', async () => {
    const buyer = await registerAndLogin();
    const escrowId = await createDraft(buyer.accessToken);
    await uploadEvidence(
      buyer.accessToken,
      escrowId,
      EvidencePhase.AT_CREATION,
      'with-exif.jpg',
      'image/jpeg',
    );

    const inviteResponse = await request(server)
      .post(`/escrows/${escrowId}/invite`)
      .set(auth(buyer.accessToken));

    expect(inviteResponse.status).toBe(201);
  });

  it('returns the bundle ordered, phase-tagged, and hashed -- deterministically', async () => {
    const buyer = await registerAndLogin();
    const escrowId = await createDraft(buyer.accessToken);

    await uploadEvidence(
      buyer.accessToken,
      escrowId,
      EvidencePhase.AT_CREATION,
      'with-exif.jpg',
      'image/jpeg',
    );
    await uploadEvidence(
      buyer.accessToken,
      escrowId,
      EvidencePhase.AT_CREATION,
      'without-exif.jpg',
      'image/jpeg',
    );
    await uploadEvidence(
      buyer.accessToken,
      escrowId,
      EvidencePhase.AT_DELIVERY,
      'plain.png',
      'image/png',
    );

    const first = await request(server).get(`/evidence/${escrowId}`).set(auth(buyer.accessToken));
    const second = await request(server).get(`/evidence/${escrowId}`).set(auth(buyer.accessToken));

    const firstBody = first.body as EvidenceBundleBody;
    const secondBody = second.body as EvidenceBundleBody;

    expect(firstBody.items).toHaveLength(3);
    expect(firstBody.items.map((item) => item.id)).toEqual(secondBody.items.map((item) => item.id));
    expect(firstBody.items.map((item) => item.phase)).toEqual([
      EvidencePhase.AT_CREATION,
      EvidencePhase.AT_CREATION,
      EvidencePhase.AT_DELIVERY,
    ]);
    expect(
      firstBody.items.every(
        (item) => typeof item.contentHash === 'string' && item.contentHash.length === 64,
      ),
    ).toBe(true);
  });
});
