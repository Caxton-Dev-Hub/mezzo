import type { Server } from 'node:http';
import { randomUUID, createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import type {
  LatestPaymentIntentResponse,
  PayoutResponse,
  WalletActivityResponse,
  WalletBalancesResponse,
} from '@mezzo/shared-types';
import { AppModule } from '../../src/app.module';
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

interface EscrowDetailBody {
  id: string;
  state: string;
}

interface InviteBody {
  token: string;
}

interface PaymentIntentBody {
  reference: string;
}

interface ErrorBody {
  code: string;
}

interface Party {
  userId: string;
  accessToken: string;
}

describe('Wallet (e2e)', () => {
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
    feeBps: 0,
  };

  function uniqueEmail(): string {
    userCounter += 1;
    return `wallet-user-${Date.now()}-${userCounter}@example.com`;
  }

  function uniqueEventId(): string {
    eventCounter += 1;
    return `evt-wallet-${Date.now()}-${eventCounter}`;
  }

  function auth(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  async function registerAndLogin(): Promise<Party> {
    const email = uniqueEmail();
    await request(server).post('/auth/register').send({ email, password });
    await users.update({ email }, { emailVerifiedAt: new Date() });
    const loginResponse = await request(server).post('/auth/login').send({ email, password });
    const body = loginResponse.body as AuthTokensBody;
    return { userId: body.user.id, accessToken: body.accessToken };
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

  async function postSignedWebhook(payload: unknown): Promise<number> {
    const rawBody = JSON.stringify(payload);
    const response = await request(server)
      .post('/payments/webhook/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(rawBody))
      .send(rawBody);
    return response.status;
  }

  function chargeSuccessPayload(reference: string, amount: number): unknown {
    return {
      event: 'charge.success',
      data: { id: uniqueEventId(), reference, amount, currency: 'NGN', status: 'success' },
    };
  }

  function transferPayload(event: string, reference: string, amount: number): unknown {
    return {
      event,
      data: {
        id: uniqueEventId(),
        reference,
        amount,
        currency: 'NGN',
        status: event.split('.')[1],
      },
    };
  }

  async function createAgreedEscrow(
    amount: number,
  ): Promise<{ escrowId: string; buyer: Party; seller: Party }> {
    const buyer = await registerAndLogin();
    const seller = await registerAndLogin();
    await grantTier1(buyer.userId);
    await grantTier1(seller.userId);

    const draftResponse = await request(server)
      .post('/escrows')
      .set(auth(buyer.accessToken))
      .send({ ...defaultTerms, price: { amount, currency: 'NGN' }, role: EscrowRole.BUYER });
    const draft = draftResponse.body as EscrowDetailBody;
    await seedCreationEvidence(draft.id, buyer.userId);

    const inviteResponse = await request(server)
      .post(`/escrows/${draft.id}/invite`)
      .set(auth(buyer.accessToken));
    const invite = inviteResponse.body as InviteBody;
    await request(server).post(`/invites/${invite.token}/accept`).set(auth(seller.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(buyer.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(seller.accessToken));

    return { escrowId: draft.id, buyer, seller };
  }

  async function fundEscrow(escrowId: string, buyer: Party, amount: number): Promise<void> {
    const fundResponse = await request(server)
      .post(`/payments/escrows/${escrowId}/fund`)
      .set(auth(buyer.accessToken));
    const intent = fundResponse.body as PaymentIntentBody;
    await postSignedWebhook(chargeSuccessPayload(intent.reference, amount));
  }

  async function getWallet(accessToken: string): Promise<WalletBalancesResponse> {
    const response = await request(server).get('/wallet').set(auth(accessToken));
    return response.body as WalletBalancesResponse;
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

  it('starts a fresh user at zero across all three balances', async () => {
    const user = await registerAndLogin();

    expect(await getWallet(user.accessToken)).toEqual({
      available: { amount: 0, currency: 'NGN' },
      pending: { amount: 0, currency: 'NGN' },
      heldInEscrow: { amount: 0, currency: 'NGN' },
    });
  });

  it('reports held-in-escrow separately from available while funds sit in an escrow', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow(120_000);
    await fundEscrow(escrowId, buyer, 120_000);

    const buyerWallet = await getWallet(buyer.accessToken);
    expect(buyerWallet.heldInEscrow).toEqual({ amount: 120_000, currency: 'NGN' });
    expect(buyerWallet.available).toEqual({ amount: 0, currency: 'NGN' });

    const sellerWallet = await getWallet(seller.accessToken);
    expect(sellerWallet.heldInEscrow).toEqual({ amount: 120_000, currency: 'NGN' });
    expect(sellerWallet.available).toEqual({ amount: 0, currency: 'NGN' });
  });

  it('moves the held balance into the seller available balance on release', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow(90_000);
    await fundEscrow(escrowId, buyer, 90_000);

    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));
    await request(server).post(`/escrows/${escrowId}/release`).set(auth(buyer.accessToken));

    const sellerWallet = await getWallet(seller.accessToken);
    expect(sellerWallet.available).toEqual({ amount: 90_000, currency: 'NGN' });
    expect(sellerWallet.heldInEscrow).toEqual({ amount: 0, currency: 'NGN' });
    expect(sellerWallet.pending).toEqual({ amount: 0, currency: 'NGN' });
  });

  it('reports a requested payout as pending, then clears it once the transfer webhook confirms', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow(70_000);
    await fundEscrow(escrowId, buyer, 70_000);
    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));
    await request(server).post(`/escrows/${escrowId}/release`).set(auth(buyer.accessToken));

    const payoutResponse = await request(server)
      .post('/payouts')
      .set(auth(seller.accessToken))
      .send({
        amount: { amount: 40_000, currency: 'NGN' },
        bankAccountNumber: '0123456789',
        bankCode: '058',
        idempotencyKey: randomUUID(),
      });
    const payout = payoutResponse.body as PayoutResponse;
    expect(payout.status).toBe('PENDING');

    const pendingWallet = await getWallet(seller.accessToken);
    expect(pendingWallet.available).toEqual({ amount: 30_000, currency: 'NGN' });
    expect(pendingWallet.pending).toEqual({ amount: 40_000, currency: 'NGN' });

    const listed = await request(server).get('/payouts').set(auth(seller.accessToken));
    expect((listed.body as PayoutResponse[])[0]).toMatchObject({
      id: payout.id,
      status: 'PENDING',
      amount: 40_000,
      currency: 'NGN',
    });

    await postSignedWebhook(transferPayload('transfer.success', payout.reference, 40_000));

    const settledWallet = await getWallet(seller.accessToken);
    expect(settledWallet.pending).toEqual({ amount: 0, currency: 'NGN' });
    expect(settledWallet.available).toEqual({ amount: 30_000, currency: 'NGN' });

    const settledList = await request(server).get('/payouts').set(auth(seller.accessToken));
    expect((settledList.body as PayoutResponse[])[0].status).toBe('CONFIRMED');
  });

  it('describes wallet activity in human terms for both parties', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow(50_000);
    await fundEscrow(escrowId, buyer, 50_000);
    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));
    await request(server).post(`/escrows/${escrowId}/release`).set(auth(buyer.accessToken));

    const buyerActivity = await request(server)
      .get('/wallet/activity')
      .set(auth(buyer.accessToken));
    expect(buyerActivity.body as WalletActivityResponse[]).toContainEqual(
      expect.objectContaining({
        kind: 'ESCROW_FUNDING',
        direction: 'OUT',
        escrowId,
        amount: { amount: 50_000, currency: 'NGN' },
      }),
    );

    const sellerActivity = await request(server)
      .get('/wallet/activity')
      .set(auth(seller.accessToken));
    expect(sellerActivity.body as WalletActivityResponse[]).toContainEqual(
      expect.objectContaining({
        kind: 'ESCROW_RELEASE',
        direction: 'IN',
        escrowId,
        amount: { amount: 50_000, currency: 'NGN' },
      }),
    );
  });

  it('reports the latest payment intent for a party and only flips to FUNDED after the webhook', async () => {
    const { escrowId, buyer } = await createAgreedEscrow(60_000);

    const before = await request(server)
      .get(`/payments/escrows/${escrowId}/intent`)
      .set(auth(buyer.accessToken));
    expect((before.body as LatestPaymentIntentResponse).intent).toBeNull();

    const fundResponse = await request(server)
      .post(`/payments/escrows/${escrowId}/fund`)
      .set(auth(buyer.accessToken));
    const created = fundResponse.body as PaymentIntentBody;

    const pending = await request(server)
      .get(`/payments/escrows/${escrowId}/intent`)
      .set(auth(buyer.accessToken));
    expect((pending.body as LatestPaymentIntentResponse).intent).toMatchObject({
      status: 'PENDING',
      amount: 60_000,
      currency: 'NGN',
    });

    await postSignedWebhook(chargeSuccessPayload(created.reference, 60_000));

    const funded = await request(server)
      .get(`/payments/escrows/${escrowId}/intent`)
      .set(auth(buyer.accessToken));
    expect((funded.body as LatestPaymentIntentResponse).intent).toMatchObject({ status: 'FUNDED' });
  });

  it('refuses the payment intent status to a user who is not a party to the escrow', async () => {
    const { escrowId } = await createAgreedEscrow(30_000);
    const stranger = await registerAndLogin();

    const response = await request(server)
      .get(`/payments/escrows/${escrowId}/intent`)
      .set(auth(stranger.accessToken));

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).code).toBe('NOT_ESCROW_PARTY');
  });

  it('requires authentication for every wallet surface', async () => {
    const balances = await request(server).get('/wallet');
    const activity = await request(server).get('/wallet/activity');
    const payouts = await request(server).get('/payouts');

    expect(balances.status).toBe(401);
    expect(activity.status).toBe(401);
    expect(payouts.status).toBe(401);
  });
});
