import type { Server } from 'node:http';
import { randomUUID, createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { EscrowRole } from '../../src/escrow/entities/escrow-role.enum';
import { User } from '../../src/database/entities/user.entity';
import { EvidenceItem } from '../../src/database/entities/evidence-item.entity';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { PaymentIntent } from '../../src/database/entities/payment-intent.entity';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { RedisService } from '../../src/redis/redis.service';

const PAYSTACK_SECRET = 'test-paystack-secret-key';

interface AuthTokensBody {
  accessToken: string;
  user: { id: string };
}

interface EscrowDetailBody {
  id: string;
  parties: { userId: string; role: EscrowRole }[];
}

interface InviteBody {
  token: string;
}

interface PaymentIntentBody {
  id: string;
  reference: string;
}

interface ReceiptBody {
  escrowId: string;
  state: string;
  price: { amount: number; currency: string };
  feeBps: number;
  feeAmount: { amount: number; currency: string };
  netAmount: { amount: number; currency: string };
  buyerEmail: string;
  sellerEmail: string;
  fundedAt: string | null;
  releasedAt: string | null;
  paymentReference: string | null;
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

describe('Receipts (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let users: Repository<User>;
  let evidenceItems: Repository<EvidenceItem>;
  let paymentIntents: Repository<PaymentIntent>;
  let redis: RedisService;
  let userCounter = 0;
  let eventCounter = 0;

  const password = 'super-secret-password';
  const validTerms = {
    price: { amount: 1_000_000, currency: 'NGN' as const },
    inspectionWindowHours: 48,
    deliveryMethod: 'courier',
    itemDescription: 'A vintage camera',
    feeBps: 250,
  };

  function uniqueEmail(): string {
    userCounter += 1;
    return `receipts-user-${Date.now()}-${userCounter}@example.com`;
  }

  function uniqueEventId(): string {
    eventCounter += 1;
    return `evt-${Date.now()}-${eventCounter}`;
  }

  function auth(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  async function registerAndLogin(): Promise<{
    userId: string;
    email: string;
    accessToken: string;
  }> {
    const email = uniqueEmail();
    await request(server).post('/auth/register').send({ email, password });
    await users.update({ email }, { emailVerifiedAt: new Date() });
    const loginResponse = await request(server).post('/auth/login').send({ email, password });
    const body = loginResponse.body as AuthTokensBody;
    return { userId: body.user.id, email, accessToken: body.accessToken };
  }

  async function grantTier1(userId: string): Promise<void> {
    await users.update({ id: userId }, { kycTier: KycTier.TIER_1 });
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

  function sign(rawBody: string): string {
    return createHmac('sha512', PAYSTACK_SECRET).update(rawBody).digest('hex');
  }

  async function fundEscrow(escrowId: string, buyerAccessToken: string): Promise<void> {
    const fundResponse = await request(server)
      .post(`/payments/escrows/${escrowId}/fund`)
      .set(auth(buyerAccessToken));
    const intent = fundResponse.body as PaymentIntentBody;

    const payload = {
      event: 'charge.success',
      data: {
        id: uniqueEventId(),
        reference: intent.reference,
        amount: validTerms.price.amount,
        currency: validTerms.price.currency,
        status: 'success',
      },
    };
    const rawBody = JSON.stringify(payload);
    await request(server)
      .post('/payments/webhook/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(rawBody))
      .send(rawBody);
  }

  async function createFundedEscrow(): Promise<{
    escrowId: string;
    buyer: { userId: string; email: string; accessToken: string };
    seller: { userId: string; email: string; accessToken: string };
  }> {
    const buyer = await registerAndLogin();
    const seller = await registerAndLogin();
    await grantTier1(buyer.userId);

    const draftResponse = await request(server)
      .post('/escrows')
      .set(auth(buyer.accessToken))
      .send({ ...validTerms, role: EscrowRole.BUYER });
    const draft = draftResponse.body as EscrowDetailBody;
    await seedCreationEvidence(draft.id, draft.parties[0].userId);

    const inviteResponse = await request(server)
      .post(`/escrows/${draft.id}/invite`)
      .set(auth(buyer.accessToken));
    const invite = inviteResponse.body as InviteBody;

    await request(server).post(`/invites/${invite.token}/accept`).set(auth(seller.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(buyer.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(seller.accessToken));

    await fundEscrow(draft.id, buyer.accessToken);

    return { escrowId: draft.id, buyer, seller };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    server = app.getHttpServer() as Server;
    users = app.get<Repository<User>>(getRepositoryToken(User));
    evidenceItems = app.get<Repository<EvidenceItem>>(getRepositoryToken(EvidenceItem));
    paymentIntents = app.get<Repository<PaymentIntent>>(getRepositoryToken(PaymentIntent));
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('rejects a receipt request before the escrow has been funded', async () => {
    const buyer = await registerAndLogin();
    await grantTier1(buyer.userId);
    const draftResponse = await request(server)
      .post('/escrows')
      .set(auth(buyer.accessToken))
      .send({ ...validTerms, role: EscrowRole.BUYER });
    const draft = draftResponse.body as EscrowDetailBody;
    await seedCreationEvidence(draft.id, draft.parties[0].userId);

    const response = await request(server)
      .get(`/escrows/${draft.id}/receipt`)
      .set(auth(buyer.accessToken));

    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).code).toBe('RECEIPT_NOT_AVAILABLE');
  });

  it('returns the price, fee split, parties, and payment reference once funded', async () => {
    const { escrowId, buyer, seller } = await createFundedEscrow();

    const response = await request(server)
      .get(`/escrows/${escrowId}/receipt`)
      .set(auth(buyer.accessToken));

    expect(response.status).toBe(200);
    const receipt = response.body as ReceiptBody;
    expect(receipt.escrowId).toBe(escrowId);
    expect(receipt.state).toBe('FUNDED');
    expect(receipt.price).toEqual(validTerms.price);
    expect(receipt.feeAmount).toEqual({ amount: 25_000, currency: 'NGN' });
    expect(receipt.netAmount).toEqual({ amount: 975_000, currency: 'NGN' });
    expect(receipt.buyerEmail).toBe(buyer.email);
    expect(receipt.sellerEmail).toBe(seller.email);
    expect(receipt.fundedAt).toEqual(expect.any(String));
    expect(receipt.releasedAt).toBeNull();
    expect(receipt.paymentReference).toEqual(expect.any(String));

    const intent = await paymentIntents.findOne({ where: { escrowId } });
    expect(receipt.paymentReference).toBe(intent?.providerReference);
  });

  it('denies a non-party', async () => {
    const { escrowId } = await createFundedEscrow();
    const stranger = await registerAndLogin();

    const response = await request(server)
      .get(`/escrows/${escrowId}/receipt`)
      .set(auth(stranger.accessToken));

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).code).toBe('NOT_ESCROW_PARTY');
  });

  it('streams a PDF for a funded escrow', async () => {
    const { escrowId, buyer } = await createFundedEscrow();

    const response = await request(server)
      .get(`/escrows/${escrowId}/receipt.pdf`)
      .set(auth(buyer.accessToken))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect((response.body as Buffer).length).toBeGreaterThan(0);
  });
});
