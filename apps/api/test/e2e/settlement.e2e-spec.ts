import type { Server } from 'node:http';
import { randomUUID, createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { EscrowState } from '../../src/escrow/entities/escrow-state.enum';
import { EscrowRole } from '../../src/escrow/entities/escrow-role.enum';
import { SettlementService } from '../../src/escrow/settlement.service';
import { User } from '../../src/database/entities/user.entity';
import { Escrow } from '../../src/database/entities/escrow.entity';
import { EvidenceItem } from '../../src/database/entities/evidence-item.entity';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { LedgerService } from '../../src/ledger/ledger.service';
import { ReconciliationService } from '../../src/ledger/reconciliation.service';
import {
  escrowHoldingRef,
  userWalletRef,
  platformFeeRevenueRef,
} from '../../src/ledger/account-refs';
import { RedisService } from '../../src/redis/redis.service';

const PAYSTACK_SECRET = 'test-paystack-secret-key';

interface AuthTokensBody {
  accessToken: string;
  user: { id: string };
}

interface EscrowDetailBody {
  id: string;
  state: EscrowState;
  parties: { userId: string; role: EscrowRole }[];
  trackingReference: string | null;
  deliveredAt: string | null;
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

describe('Settlement (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let settlementService: SettlementService;
  let users: Repository<User>;
  let escrows: Repository<Escrow>;
  let evidenceItems: Repository<EvidenceItem>;
  let ledger: LedgerService;
  let reconciliation: ReconciliationService;
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
    return `settlement-user-${Date.now()}-${userCounter}@example.com`;
  }

  function uniqueEventId(): string {
    eventCounter += 1;
    return `evt-settlement-${Date.now()}-${eventCounter}`;
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

  function chargeSuccessPayload(reference: string, amount: number, currency = 'NGN'): unknown {
    return {
      event: 'charge.success',
      data: { id: uniqueEventId(), reference, amount, currency, status: 'success' },
    };
  }

  async function createFundedEscrow(
    priceAmount: number,
    actors?: {
      buyer: { userId: string; accessToken: string };
      seller: { userId: string; accessToken: string };
    },
  ): Promise<{
    escrowId: string;
    buyer: { userId: string; accessToken: string };
    seller: { userId: string; accessToken: string };
    priceAmount: number;
    feeBps: number;
  }> {
    const buyer = actors?.buyer ?? (await registerAndLogin());
    const seller = actors?.seller ?? (await registerAndLogin());
    if (!actors) {
      await grantTier1(buyer.userId);
    }

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

    const status = await postSignedWebhook(chargeSuccessPayload(intent.reference, priceAmount));
    expect(status).toBe(200);

    return {
      escrowId: draft.id,
      buyer,
      seller,
      priceAmount,
      feeBps: defaultTerms.feeBps,
    };
  }

  async function getEscrow(escrowId: string, accessToken: string): Promise<EscrowDetailBody> {
    const response = await request(server).get(`/escrows/${escrowId}`).set(auth(accessToken));
    return response.body as EscrowDetailBody;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    server = app.getHttpServer() as Server;
    settlementService = app.get(SettlementService);
    users = app.get<Repository<User>>(getRepositoryToken(User));
    escrows = app.get<Repository<Escrow>>(getRepositoryToken(Escrow));
    evidenceItems = app.get<Repository<EvidenceItem>>(getRepositoryToken(EvidenceItem));
    ledger = app.get(LedgerService);
    reconciliation = app.get(ReconciliationService);
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('drives the happy path fund -> ship -> deliver -> release and pays seller price-minus-fee plus platform fee', async () => {
    const { escrowId, buyer, seller, priceAmount, feeBps } = await createFundedEscrow(200_000);

    const shipResponse = await request(server)
      .post(`/escrows/${escrowId}/ship`)
      .set(auth(seller.accessToken))
      .send({ trackingReference: 'WAYBILL-123' });
    expect(shipResponse.status).toBe(200);
    expect((shipResponse.body as EscrowDetailBody).state).toBe(EscrowState.SHIPPED);
    expect((shipResponse.body as EscrowDetailBody).trackingReference).toBe('WAYBILL-123');

    const deliverResponse = await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));
    expect(deliverResponse.status).toBe(200);
    expect((deliverResponse.body as EscrowDetailBody).state).toBe(EscrowState.DELIVERED);
    expect((deliverResponse.body as EscrowDetailBody).deliveredAt).not.toBeNull();

    const releaseResponse = await request(server)
      .post(`/escrows/${escrowId}/release`)
      .set(auth(buyer.accessToken));
    expect(releaseResponse.status).toBe(200);
    expect((releaseResponse.body as EscrowDetailBody).state).toBe(EscrowState.RELEASED);

    const feeAmount = Math.floor((priceAmount * feeBps) / 10_000);
    const sellerAmount = priceAmount - feeAmount;

    expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({
      amount: 0,
      currency: 'NGN',
    });
    expect(await ledger.getBalance(userWalletRef(seller.userId))).toEqual({
      amount: sellerAmount,
      currency: 'NGN',
    });

    const feeBalance = await ledger.getBalance(platformFeeRevenueRef());
    expect(feeBalance.amount).toBeGreaterThanOrEqual(feeAmount);
  });

  it('rejects ship from a non-seller and confirm-delivery/release from a non-buyer', async () => {
    const { escrowId, buyer, seller } = await createFundedEscrow(50_000);

    const buyerShips = await request(server)
      .post(`/escrows/${escrowId}/ship`)
      .set(auth(buyer.accessToken))
      .send({});
    expect(buyerShips.status).toBe(403);
    expect((buyerShips.body as ErrorBody).code).toBe('ONLY_SELLER_MAY_ACT');

    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});

    const sellerDelivers = await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(seller.accessToken));
    expect(sellerDelivers.status).toBe(403);
    expect((sellerDelivers.body as ErrorBody).code).toBe('ONLY_BUYER_MAY_ACT');

    await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));

    const sellerReleases = await request(server)
      .post(`/escrows/${escrowId}/release`)
      .set(auth(seller.accessToken));
    expect(sellerReleases.status).toBe(403);
  });

  it('auto-release fires exactly once; a second firing is a no-op', async () => {
    const { escrowId, buyer, seller, priceAmount, feeBps } = await createFundedEscrow(100_000);
    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));

    await settlementService.autoRelease(escrowId);
    const escrow = await getEscrow(escrowId, buyer.accessToken);
    expect(escrow.state).toBe(EscrowState.RELEASED);

    await settlementService.autoRelease(escrowId);

    const feeAmount = Math.floor((priceAmount * feeBps) / 10_000);
    const sellerAmount = priceAmount - feeAmount;
    expect(await ledger.getBalance(userWalletRef(seller.userId))).toEqual({
      amount: sellerAmount,
      currency: 'NGN',
    });
  });

  it('race: dispute vs auto-release resolves to exactly one outcome with no double payment', async () => {
    const { escrowId, buyer, seller, priceAmount, feeBps } = await createFundedEscrow(150_000);
    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));

    const [autoReleaseResult, disputeResult] = await Promise.allSettled([
      settlementService.autoRelease(escrowId),
      settlementService.dispute(escrowId, buyer.userId),
    ]);

    // autoRelease() never throws -- it swallows StaleEscrowVersionError and
    // IllegalTransitionError as expected no-ops when it loses the race.
    // dispute() does not swallow those, so it is a legitimate outcome for it
    // to reject when release won -- the assertion below is on the *escrow's*
    // final state and the money, not on both promises settling the same way.
    expect(autoReleaseResult.status).toBe('fulfilled');
    if (disputeResult.status === 'rejected') {
      expect(disputeResult.reason).toMatchObject({
        code: expect.stringMatching(
          /^(ILLEGAL_ESCROW_TRANSITION|STALE_ESCROW_VERSION)$/,
        ) as unknown,
      });
    }

    const escrow = await getEscrow(escrowId, buyer.accessToken);
    expect([EscrowState.RELEASED, EscrowState.DISPUTED]).toContain(escrow.state);

    const feeAmount = Math.floor((priceAmount * feeBps) / 10_000);
    const sellerAmount = priceAmount - feeAmount;

    if (escrow.state === EscrowState.RELEASED) {
      // The seller's wallet account is only ever created by a successful
      // release -- if dispute had won instead, this ref would not exist yet,
      // so it must only be queried on this branch.
      expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({
        amount: 0,
        currency: 'NGN',
      });
      expect(await ledger.getBalance(userWalletRef(seller.userId))).toEqual({
        amount: sellerAmount,
        currency: 'NGN',
      });
    } else {
      expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({
        amount: priceAmount,
        currency: 'NGN',
      });
    }

    const report = await reconciliation.reconcile();
    expect(report.globalBalanced).toBe(true);
  });

  it('double release: two concurrent release requests credit the seller exactly once', async () => {
    const { escrowId, buyer, seller, priceAmount, feeBps } = await createFundedEscrow(120_000);
    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));

    const results = await Promise.allSettled([
      settlementService.release(escrowId, buyer.userId),
      settlementService.release(escrowId, buyer.userId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const feeAmount = Math.floor((priceAmount * feeBps) / 10_000);
    const sellerAmount = priceAmount - feeAmount;
    expect(await ledger.getBalance(userWalletRef(seller.userId))).toEqual({
      amount: sellerAmount,
      currency: 'NGN',
    });
  });

  it('rejects a late confirm-delivery/release/refund on a RELEASED escrow and moves no money', async () => {
    const { escrowId, buyer, seller } = await createFundedEscrow(70_000);
    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));
    await request(server).post(`/escrows/${escrowId}/release`).set(auth(buyer.accessToken));

    const balanceAfterRelease = await ledger.getBalance(userWalletRef(seller.userId));

    const lateDeliver = await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));
    expect(lateDeliver.status).toBe(409);

    const lateRelease = await request(server)
      .post(`/escrows/${escrowId}/release`)
      .set(auth(buyer.accessToken));
    expect(lateRelease.status).toBe(409);

    await expect(settlementService.refund(escrowId, null)).rejects.toMatchObject({
      code: 'ILLEGAL_ESCROW_TRANSITION',
    });

    expect(await ledger.getBalance(userWalletRef(seller.userId))).toEqual(balanceAfterRelease);
  });

  it('refund credits the buyer wallet and leaves the escrow holding at zero', async () => {
    const { escrowId, buyer } = await createFundedEscrow(90_000);
    await escrows.update({ id: escrowId }, { state: EscrowState.DISPUTED });
    await escrows.update({ id: escrowId }, { state: EscrowState.RESOLVED_REFUND });

    const refunded = await settlementService.refund(escrowId, null);
    expect(refunded.state).toBe(EscrowState.REFUNDED);

    expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({
      amount: 0,
      currency: 'NGN',
    });
    expect(await ledger.getBalance(userWalletRef(buyer.userId))).toEqual({
      amount: 90_000,
      currency: 'NGN',
    });
  });

  it('holds the global ledger invariant after a randomized interleaving of settlement paths', async () => {
    const buyer = await registerAndLogin();
    const seller = await registerAndLogin();
    await grantTier1(buyer.userId);

    for (let i = 0; i < 6; i += 1) {
      const amount = 10_000 + i * 5_000;
      const { escrowId } = await createFundedEscrow(amount, { buyer, seller });
      await request(server)
        .post(`/escrows/${escrowId}/ship`)
        .set(auth(seller.accessToken))
        .send({});
      await request(server)
        .post(`/escrows/${escrowId}/confirm-delivery`)
        .set(auth(buyer.accessToken));

      if (i % 2 === 0) {
        await settlementService.release(escrowId, buyer.userId);
      } else {
        await escrows.update({ id: escrowId }, { state: EscrowState.DISPUTED });
        await escrows.update({ id: escrowId }, { state: EscrowState.RESOLVED_REFUND });
        await settlementService.refund(escrowId, null);
      }
    }

    const report = await reconciliation.reconcile();
    expect(report.globalBalanced).toBe(true);
  });
});
