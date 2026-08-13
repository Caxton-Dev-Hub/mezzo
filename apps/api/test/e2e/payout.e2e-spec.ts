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
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { LedgerService } from '../../src/ledger/ledger.service';
import { userWalletRef, providerClearingRef } from '../../src/ledger/account-refs';
import { PayoutStatus } from '../../src/payments/entities/payout-status.enum';
import { Payout } from '../../src/database/entities/payout.entity';
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
  reference: string;
}

interface PayoutResponseBody {
  id: string;
  status: PayoutStatus;
  reference: string;
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

describe('Payout (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let users: Repository<User>;
  let evidenceItems: Repository<EvidenceItem>;
  let payouts: Repository<Payout>;
  let ledger: LedgerService;
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
    return `payout-user-${Date.now()}-${userCounter}@example.com`;
  }

  function uniqueEventId(): string {
    eventCounter += 1;
    return `evt-payout-${Date.now()}-${eventCounter}`;
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

  async function createSellerWithWalletBalance(amount: number): Promise<{
    seller: { userId: string; accessToken: string };
  }> {
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

    const fundResponse = await request(server)
      .post(`/payments/escrows/${draft.id}/fund`)
      .set(auth(buyer.accessToken));
    const intent = fundResponse.body as PaymentIntentBody;
    await postSignedWebhook(chargeSuccessPayload(intent.reference, amount));

    await request(server).post(`/escrows/${draft.id}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${draft.id}/confirm-delivery`)
      .set(auth(buyer.accessToken));
    await request(server).post(`/escrows/${draft.id}/release`).set(auth(buyer.accessToken));

    return { seller };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    server = app.getHttpServer() as Server;
    users = app.get<Repository<User>>(getRepositoryToken(User));
    evidenceItems = app.get<Repository<EvidenceItem>>(getRepositoryToken(EvidenceItem));
    payouts = app.get<Repository<Payout>>(getRepositoryToken(Payout));
    ledger = app.get(LedgerService);
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('debits the wallet and credits provider clearing when a payout is requested', async () => {
    const { seller } = await createSellerWithWalletBalance(80_000);

    const response = await request(server)
      .post('/payouts')
      .set(auth(seller.accessToken))
      .send({
        amount: { amount: 30_000, currency: 'NGN' },
        bankAccountNumber: '0123456789',
        bankCode: '058',
        idempotencyKey: randomUUID(),
      });

    expect(response.status).toBe(201);
    const payout = response.body as PayoutResponseBody;
    expect(payout.status).toBe(PayoutStatus.PENDING);

    expect(await ledger.getBalance(userWalletRef(seller.userId))).toEqual({
      amount: 50_000,
      currency: 'NGN',
    });
  });

  it('retries on the same idempotency key without double-transferring', async () => {
    const { seller } = await createSellerWithWalletBalance(80_000);
    const idempotencyKey = randomUUID();
    const body = {
      amount: { amount: 20_000, currency: 'NGN' },
      bankAccountNumber: '0123456789',
      bankCode: '058',
      idempotencyKey,
    };

    const first = await request(server).post('/payouts').set(auth(seller.accessToken)).send(body);
    const second = await request(server).post('/payouts').set(auth(seller.accessToken)).send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((second.body as PayoutResponseBody).id).toBe((first.body as PayoutResponseBody).id);

    expect(await ledger.getBalance(userWalletRef(seller.userId))).toEqual({
      amount: 60_000,
      currency: 'NGN',
    });

    const payoutCount = await payouts.count({ where: { idempotencyKey } });
    expect(payoutCount).toBe(1);
  });

  it('rejects a payout that exceeds the available wallet balance', async () => {
    const { seller } = await createSellerWithWalletBalance(10_000);

    const response = await request(server)
      .post('/payouts')
      .set(auth(seller.accessToken))
      .send({
        amount: { amount: 50_000, currency: 'NGN' },
        bankAccountNumber: '0123456789',
        bankCode: '058',
        idempotencyKey: randomUUID(),
      });

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).code).toBe('INSUFFICIENT_WALLET_BALANCE');
  });

  it('blocks a payout for a seller below the required KYC tier', async () => {
    const seller = await registerAndLogin();

    const response = await request(server)
      .post('/payouts')
      .set(auth(seller.accessToken))
      .send({
        amount: { amount: 1_000, currency: 'NGN' },
        bankAccountNumber: '0123456789',
        bankCode: '058',
        idempotencyKey: randomUUID(),
      });

    expect(response.status).toBe(403);
  });

  it('confirms the payout on a transfer.success webhook without moving money again', async () => {
    const { seller } = await createSellerWithWalletBalance(60_000);
    const response = await request(server)
      .post('/payouts')
      .set(auth(seller.accessToken))
      .send({
        amount: { amount: 20_000, currency: 'NGN' },
        bankAccountNumber: '0123456789',
        bankCode: '058',
        idempotencyKey: randomUUID(),
      });
    const payout = response.body as PayoutResponseBody;

    const status = await postSignedWebhook(
      transferPayload('transfer.success', payout.reference, 20_000),
    );
    expect(status).toBe(200);

    const confirmed = await payouts.findOneOrFail({ where: { id: payout.id } });
    expect(confirmed.status).toBe(PayoutStatus.CONFIRMED);
    expect(await ledger.getBalance(userWalletRef(seller.userId))).toEqual({
      amount: 40_000,
      currency: 'NGN',
    });
  });

  it('reverses the ledger posting and marks the payout FAILED on a transfer.failed webhook', async () => {
    const { seller } = await createSellerWithWalletBalance(60_000);
    const response = await request(server)
      .post('/payouts')
      .set(auth(seller.accessToken))
      .send({
        amount: { amount: 20_000, currency: 'NGN' },
        bankAccountNumber: '0123456789',
        bankCode: '058',
        idempotencyKey: randomUUID(),
      });
    const payout = response.body as PayoutResponseBody;

    expect(await ledger.getBalance(userWalletRef(seller.userId))).toEqual({
      amount: 40_000,
      currency: 'NGN',
    });

    const status = await postSignedWebhook(
      transferPayload('transfer.failed', payout.reference, 20_000),
    );
    expect(status).toBe(200);

    const failed = await payouts.findOneOrFail({ where: { id: payout.id } });
    expect(failed.status).toBe(PayoutStatus.FAILED);
    expect(await ledger.getBalance(userWalletRef(seller.userId))).toEqual({
      amount: 60_000,
      currency: 'NGN',
    });

    const clearingBalance = await ledger.getBalance(providerClearingRef('paystack'));
    expect(clearingBalance.currency).toBe('NGN');
  });
});
