import type { Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { EscrowState } from '../../src/escrow/entities/escrow-state.enum';
import { EscrowRole } from '../../src/escrow/entities/escrow-role.enum';
import { User } from '../../src/database/entities/user.entity';
import { EvidenceItem } from '../../src/database/entities/evidence-item.entity';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { RedisService } from '../../src/redis/redis.service';

const PAYSTACK_SECRET = 'test-paystack-secret-key';

interface AuthTokensBody {
  accessToken: string;
  user: { id: string };
}

interface ProfileBody {
  id: string;
  businessName: string | null;
  bio: string | null;
  location: string | null;
  avatarUrl: string | null;
  kycTier: KycTier;
  completedEscrows: number;
  memberSince: string;
  email?: string;
  role?: string;
}

interface PresignBody {
  uploadUrl: string;
  key: string;
}

interface EscrowDetailBody {
  id: string;
  state: EscrowState;
}

interface InviteBody {
  token: string;
}

interface PaymentIntentBody {
  reference: string;
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

const fixturesDir = join(__dirname, '..', 'fixtures', 'evidence');

describe('Profiles (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let users: Repository<User>;
  let evidenceItems: Repository<EvidenceItem>;
  let redis: RedisService;
  let userCounter = 0;
  let eventCounter = 0;

  const password = 'super-secret-password';
  const defaultTerms = {
    inspectionWindowHours: 48,
    deliveryMethod: 'courier',
    itemDescription: 'A vintage camera',
    feeBps: 250,
  };

  function uniqueEmail(): string {
    userCounter += 1;
    return `profile-user-${Date.now()}-${userCounter}@example.com`;
  }

  function uniqueEventId(): string {
    eventCounter += 1;
    return `evt-profile-${Date.now()}-${eventCounter}`;
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

  async function seedCreationEvidence(escrowId: string, uploaderId: string): Promise<void> {
    await evidenceItems.save(
      evidenceItems.create({
        escrowId,
        uploaderId,
        phase: EvidencePhase.AT_CREATION,
        storageKey: `evidence/${escrowId}/seed-${randomUUID()}`,
        contentHash: `seed-hash-${randomUUID()}`,
        declaredMime: 'image/jpeg',
        detectedMime: 'image/jpeg',
        sizeBytes: 1,
        width: null,
        height: null,
        capturedAt: null,
        deviceMake: null,
        deviceModel: null,
        gpsLatitude: null,
        gpsLongitude: null,
      }),
    );
  }

  async function postSignedWebhook(payload: unknown): Promise<number> {
    const rawBody = JSON.stringify(payload);
    const response = await request(server)
      .post('/payments/webhook/paystack')
      .set('Content-Type', 'application/json')
      .set(
        'x-paystack-signature',
        createHmac('sha512', PAYSTACK_SECRET).update(rawBody).digest('hex'),
      )
      .send(rawBody);
    return response.status;
  }

  async function completeEscrow(
    buyer: { userId: string; accessToken: string },
    seller: { userId: string; accessToken: string },
  ): Promise<void> {
    const priceAmount = 100_000;
    await users.update({ id: buyer.userId }, { kycTier: KycTier.TIER_1 });

    const draftResponse = await request(server)
      .post('/escrows')
      .set(auth(buyer.accessToken))
      .send({
        ...defaultTerms,
        price: { amount: priceAmount, currency: 'NGN' },
        role: EscrowRole.BUYER,
      });
    const draft = draftResponse.body as EscrowDetailBody;
    await seedCreationEvidence(draft.id, buyer.userId);

    const inviteResponse = await request(server)
      .post(`/escrows/${draft.id}/invite`)
      .set(auth(buyer.accessToken));
    const invite = inviteResponse.body as InviteBody;

    await request(server).post(`/invites/${invite.token}/accept`).set(auth(seller.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(buyer.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(seller.accessToken));

    const fundResponse = await request(server)
      .post(`/payments/escrows/${draft.id}/fund`)
      .set(auth(buyer.accessToken));
    const intent = fundResponse.body as PaymentIntentBody;
    expect(
      await postSignedWebhook({
        event: 'charge.success',
        data: {
          id: uniqueEventId(),
          reference: intent.reference,
          amount: priceAmount,
          currency: 'NGN',
          status: 'success',
        },
      }),
    ).toBe(200);

    await request(server)
      .post(`/escrows/${draft.id}/ship`)
      .set(auth(seller.accessToken))
      .send({ trackingReference: 'TRACK-123' });
    await request(server)
      .post(`/escrows/${draft.id}/confirm-delivery`)
      .set(auth(buyer.accessToken));

    const releaseResponse = await request(server)
      .post(`/escrows/${draft.id}/release`)
      .set(auth(buyer.accessToken));
    expect((releaseResponse.body as EscrowDetailBody).state).toBe(EscrowState.RELEASED);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    server = app.getHttpServer() as Server;
    users = app.get<Repository<User>>(getRepositoryToken(User));
    evidenceItems = app.get<Repository<EvidenceItem>>(getRepositoryToken(EvidenceItem));
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('starts every user with an empty profile and a zero escrow count', async () => {
    const user = await registerAndLogin();

    const response = await request(server).get('/profiles/me').set(auth(user.accessToken));

    expect(response.status).toBe(200);
    const profile = response.body as ProfileBody;
    expect(profile.id).toBe(user.userId);
    expect(profile.businessName).toBeNull();
    expect(profile.avatarUrl).toBeNull();
    expect(profile.completedEscrows).toBe(0);
    expect(profile.kycTier).toBe(KycTier.TIER_0);
  });

  it('saves the profile fields the owner edits', async () => {
    const user = await registerAndLogin();

    const response = await request(server).patch('/profiles/me').set(auth(user.accessToken)).send({
      businessName: 'Ada Electronics',
      bio: 'Refurbished laptops, Lagos.',
      location: 'Lagos',
    });

    expect(response.status).toBe(200);
    const profile = response.body as ProfileBody;
    expect(profile.businessName).toBe('Ada Electronics');
    expect(profile.bio).toBe('Refurbished laptops, Lagos.');
    expect(profile.location).toBe('Lagos');
  });

  it('normalises blank profile fields to null rather than storing empty strings', async () => {
    const user = await registerAndLogin();

    await request(server)
      .patch('/profiles/me')
      .set(auth(user.accessToken))
      .send({ businessName: 'Temporary', bio: null, location: null });

    const response = await request(server)
      .patch('/profiles/me')
      .set(auth(user.accessToken))
      .send({ businessName: '   ', bio: '', location: null });

    expect(response.status).toBe(200);
    expect((response.body as ProfileBody).businessName).toBeNull();
  });

  it('rejects a business name longer than the shared schema allows', async () => {
    const user = await registerAndLogin();

    const response = await request(server)
      .patch('/profiles/me')
      .set(auth(user.accessToken))
      .send({ businessName: 'x'.repeat(81), bio: null, location: null });

    expect(response.status).toBe(400);
  });

  it('shows another user the trust fields but never the email or role', async () => {
    const owner = await registerAndLogin();
    const viewer = await registerAndLogin();

    await request(server)
      .patch('/profiles/me')
      .set(auth(owner.accessToken))
      .send({ businessName: 'Ada Electronics', bio: 'Refurbished laptops.', location: 'Lagos' });

    const response = await request(server)
      .get(`/profiles/${owner.userId}`)
      .set(auth(viewer.accessToken));

    expect(response.status).toBe(200);
    const profile = response.body as ProfileBody;
    expect(profile.businessName).toBe('Ada Electronics');
    expect(profile.completedEscrows).toBe(0);
    expect(profile.memberSince).toBeDefined();
    expect(profile.email).toBeUndefined();
    expect(profile.role).toBeUndefined();
  });

  it('requires authentication to view someone else’s profile', async () => {
    const owner = await registerAndLogin();

    const response = await request(server).get(`/profiles/${owner.userId}`);

    expect(response.status).toBe(401);
  });

  it('counts a released escrow for both the buyer and the seller', async () => {
    const buyer = await registerAndLogin();
    const seller = await registerAndLogin();

    await completeEscrow(buyer, seller);

    const buyerProfile = await request(server).get('/profiles/me').set(auth(buyer.accessToken));
    const sellerProfile = await request(server)
      .get(`/profiles/${seller.userId}`)
      .set(auth(buyer.accessToken));

    expect((buyerProfile.body as ProfileBody).completedEscrows).toBe(1);
    expect((sellerProfile.body as ProfileBody).completedEscrows).toBe(1);
  });

  it('does not count an escrow that never reached RELEASED', async () => {
    const buyer = await registerAndLogin();

    const draftResponse = await request(server)
      .post('/escrows')
      .set(auth(buyer.accessToken))
      .send({
        ...defaultTerms,
        price: { amount: 100_000, currency: 'NGN' },
        role: EscrowRole.BUYER,
      });
    expect(draftResponse.status).toBe(201);

    const response = await request(server).get('/profiles/me').set(auth(buyer.accessToken));

    expect((response.body as ProfileBody).completedEscrows).toBe(0);
  });

  it('stores an uploaded avatar and hands back a fetchable url', async () => {
    const user = await registerAndLogin();
    const image = readFileSync(join(fixturesDir, 'plain.png'));

    const presignResponse = await request(server)
      .post('/profiles/me/avatar/presign')
      .set(auth(user.accessToken))
      .send({ mimeType: 'image/png' });
    expect(presignResponse.status).toBe(201);
    const presign = presignResponse.body as PresignBody;
    expect(presign.key.startsWith(`avatars/${user.userId}/`)).toBe(true);

    const putResponse = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: image,
    });
    expect(putResponse.status).toBe(200);

    const confirmResponse = await request(server)
      .post('/profiles/me/avatar')
      .set(auth(user.accessToken))
      .send({ key: presign.key, declaredMime: 'image/png' });

    expect(confirmResponse.status).toBe(201);
    const avatarUrl = (confirmResponse.body as ProfileBody).avatarUrl;
    expect(avatarUrl).not.toBeNull();

    const download = await fetch(avatarUrl as string);
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer()).equals(image)).toBe(true);
  });

  it('rejects an avatar whose bytes do not match the declared image type', async () => {
    const user = await registerAndLogin();

    const presignResponse = await request(server)
      .post('/profiles/me/avatar/presign')
      .set(auth(user.accessToken))
      .send({ mimeType: 'image/png' });
    const presign = presignResponse.body as PresignBody;

    await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: Buffer.from('this is definitely not a png'),
    });

    const confirmResponse = await request(server)
      .post('/profiles/me/avatar')
      .set(auth(user.accessToken))
      .send({ key: presign.key, declaredMime: 'image/png' });

    expect(confirmResponse.status).toBe(422);
    expect((confirmResponse.body as ErrorBody).code).toBe('AVATAR_MIME_MISMATCH');
  });

  it('refuses to attach a storage key that belongs to another user', async () => {
    const owner = await registerAndLogin();
    const attacker = await registerAndLogin();

    const presignResponse = await request(server)
      .post('/profiles/me/avatar/presign')
      .set(auth(owner.accessToken))
      .send({ mimeType: 'image/png' });
    const presign = presignResponse.body as PresignBody;

    const confirmResponse = await request(server)
      .post('/profiles/me/avatar')
      .set(auth(attacker.accessToken))
      .send({ key: presign.key, declaredMime: 'image/png' });

    expect(confirmResponse.status).toBe(400);
    expect((confirmResponse.body as ErrorBody).code).toBe('INVALID_AVATAR_KEY');
  });
});
