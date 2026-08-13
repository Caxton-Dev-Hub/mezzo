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
import { User } from '../../src/database/entities/user.entity';
import { EvidenceItem } from '../../src/database/entities/evidence-item.entity';
import { Dispute } from '../../src/database/entities/dispute.entity';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { UserRole } from '../../src/users/entities/user-role.enum';
import { DisputeReasonCode } from '../../src/disputes/entities/dispute-reason-code.enum';
import { DisputeState } from '../../src/disputes/entities/dispute-state.enum';
import { DisputeResolutionOutcome } from '../../src/disputes/entities/dispute-resolution-outcome.enum';
import { DisputeService } from '../../src/disputes/dispute.service';
import { SettlementService } from '../../src/escrow/settlement.service';
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
}

interface InviteBody {
  token: string;
}

interface PaymentIntentBody {
  reference: string;
}

interface DisputeBody {
  id: string;
  escrowId: string;
  state: DisputeState;
  reasonCode: DisputeReasonCode;
  resolvedOutcome: DisputeResolutionOutcome | null;
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

interface DisputePacketBody {
  submissionFlags: {
    buyerSubmitted: boolean;
    sellerSubmitted: boolean;
    evidenceWindowElapsed: boolean;
  };
  sellerEvidence: unknown[];
  buyerEvidence: unknown[];
}

describe('Disputes (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let disputeService: DisputeService;
  let settlementService: SettlementService;
  let users: Repository<User>;
  let evidenceItems: Repository<EvidenceItem>;
  let disputes: Repository<Dispute>;
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
    return `dispute-user-${Date.now()}-${userCounter}@example.com`;
  }

  function uniqueEventId(): string {
    eventCounter += 1;
    return `evt-dispute-${Date.now()}-${eventCounter}`;
  }

  function auth(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  async function registerAndLogin(role: UserRole = UserRole.USER): Promise<{
    userId: string;
    accessToken: string;
  }> {
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

  async function grantTier1(userId: string): Promise<void> {
    await users.update({ id: userId }, { kycTier: KycTier.TIER_1 });
  }

  async function seedEvidence(
    escrowId: string,
    uploaderId: string,
    phase: EvidencePhase,
  ): Promise<void> {
    await evidenceItems.save(
      evidenceItems.create({
        escrowId,
        uploaderId,
        phase,
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

  async function createDeliveredEscrow(priceAmount: number): Promise<{
    escrowId: string;
    buyer: { userId: string; accessToken: string };
    seller: { userId: string; accessToken: string };
    priceAmount: number;
    feeBps: number;
  }> {
    const buyer = await registerAndLogin();
    const seller = await registerAndLogin();
    await grantTier1(buyer.userId);

    const draftResponse = await request(server)
      .post('/escrows')
      .set(auth(buyer.accessToken))
      .send({
        ...defaultTerms,
        price: { amount: priceAmount, currency: 'NGN' },
        role: EscrowRole.BUYER,
      });
    const draft = draftResponse.body as EscrowDetailBody;
    await seedEvidence(draft.id, buyer.userId, EvidencePhase.AT_CREATION);

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

    await request(server).post(`/escrows/${draft.id}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${draft.id}/confirm-delivery`)
      .set(auth(buyer.accessToken));

    return { escrowId: draft.id, buyer, seller, priceAmount, feeBps: defaultTerms.feeBps };
  }

  async function raiseDispute(
    escrowId: string,
    buyer: { accessToken: string; userId: string },
    reasonCode: DisputeReasonCode = DisputeReasonCode.NOT_AS_DESCRIBED,
  ): Promise<DisputeBody> {
    await seedEvidence(escrowId, buyer.userId, EvidencePhase.AT_DELIVERY);
    const response = await request(server)
      .post(`/escrows/${escrowId}/disputes`)
      .set(auth(buyer.accessToken))
      .send({ reasonCode, statement: 'The item does not match the listing.' });
    expect(response.status).toBe(201);
    return response.body as DisputeBody;
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
    disputeService = app.get(DisputeService);
    settlementService = app.get(SettlementService);
    users = app.get<Repository<User>>(getRepositoryToken(User));
    evidenceItems = app.get<Repository<EvidenceItem>>(getRepositoryToken(EvidenceItem));
    disputes = app.get<Repository<Dispute>>(getRepositoryToken(Dispute));
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

  it('rejects raising a dispute without prior AT_DELIVERY evidence', async () => {
    const { escrowId, buyer } = await createDeliveredEscrow(40_000);

    const response = await request(server)
      .post(`/escrows/${escrowId}/disputes`)
      .set(auth(buyer.accessToken))
      .send({ reasonCode: DisputeReasonCode.DAMAGED, statement: 'Arrived broken.' });

    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).code).toBe('MISSING_DISPUTE_EVIDENCE');
  });

  it('only the buyer may raise a dispute', async () => {
    const { escrowId, seller } = await createDeliveredEscrow(40_000);
    await seedEvidence(escrowId, seller.userId, EvidencePhase.AT_DELIVERY);

    const response = await request(server)
      .post(`/escrows/${escrowId}/disputes`)
      .set(auth(seller.accessToken))
      .send({ reasonCode: DisputeReasonCode.DAMAGED, statement: 'Arrived broken.' });

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).code).toBe('ONLY_BUYER_MAY_ACT');
  });

  it.each(Object.values(DisputeReasonCode))('accepts the reason code %s', async (reasonCode) => {
    const { escrowId, buyer } = await createDeliveredEscrow(40_000);
    const dispute = await raiseDispute(escrowId, buyer, reasonCode);
    expect(dispute.reasonCode).toBe(reasonCode);
    expect(dispute.state).toBe(DisputeState.EVIDENCE);
  });

  it('rejects an unknown reason code', async () => {
    const { escrowId, buyer } = await createDeliveredEscrow(40_000);
    await seedEvidence(escrowId, buyer.userId, EvidencePhase.AT_DELIVERY);

    const response = await request(server)
      .post(`/escrows/${escrowId}/disputes`)
      .set(auth(buyer.accessToken))
      .send({ reasonCode: 'NOT_A_REAL_CODE', statement: 'Something is wrong.' });

    expect(response.status).toBe(400);
  });

  it('freezes the escrow: auto-release and manual release/refund are all blocked while DISPUTED', async () => {
    const { escrowId, buyer, seller } = await createDeliveredEscrow(80_000);
    await raiseDispute(escrowId, buyer);

    const escrowAfterDispute = await getEscrow(escrowId, buyer.accessToken);
    expect(escrowAfterDispute.state).toBe(EscrowState.DISPUTED);

    await settlementService.autoRelease(escrowId);
    expect((await getEscrow(escrowId, buyer.accessToken)).state).toBe(EscrowState.DISPUTED);

    const releaseAttempt = await request(server)
      .post(`/escrows/${escrowId}/release`)
      .set(auth(buyer.accessToken));
    expect(releaseAttempt.status).toBe(409);

    await expect(settlementService.refund(escrowId, null)).rejects.toMatchObject({
      code: 'ILLEGAL_ESCROW_TRANSITION',
    });

    expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({
      amount: 80_000,
      currency: 'NGN',
    });
    void seller;
  });

  it('denies packet access to a non-party, non-arbiter user', async () => {
    const { escrowId, buyer } = await createDeliveredEscrow(40_000);
    const dispute = await raiseDispute(escrowId, buyer);
    const stranger = await registerAndLogin();

    const response = await request(server)
      .get(`/disputes/${dispute.id}`)
      .set(auth(stranger.accessToken));

    expect(response.status).toBe(403);
  });

  it('lets both parties find an escrow dispute and keeps it hidden from non-parties', async () => {
    const { escrowId, buyer, seller } = await createDeliveredEscrow(40_000);

    const beforeRaising = await request(server)
      .get(`/escrows/${escrowId}/disputes`)
      .set(auth(seller.accessToken));
    expect(beforeRaising.status).toBe(200);
    expect(beforeRaising.body).toEqual([]);

    const dispute = await raiseDispute(escrowId, buyer);

    for (const party of [buyer, seller]) {
      const response = await request(server)
        .get(`/escrows/${escrowId}/disputes`)
        .set(auth(party.accessToken));
      expect(response.status).toBe(200);
      expect((response.body as DisputeBody[]).map((entry) => entry.id)).toEqual([dispute.id]);
    }

    const stranger = await registerAndLogin();
    const denied = await request(server)
      .get(`/escrows/${escrowId}/disputes`)
      .set(auth(stranger.accessToken));
    expect(denied.status).toBe(403);
  });

  it('records non-submission as a flag once the evidence window has elapsed', async () => {
    const { escrowId, buyer, seller } = await createDeliveredEscrow(40_000);
    const dispute = await raiseDispute(escrowId, buyer);
    const arbiter = await registerAndLogin(UserRole.ARBITER);

    const earlyPacket = await request(server)
      .get(`/disputes/${dispute.id}`)
      .set(auth(arbiter.accessToken));
    expect((earlyPacket.body as DisputePacketBody).submissionFlags).toEqual({
      buyerSubmitted: true,
      sellerSubmitted: false,
      evidenceWindowElapsed: false,
    });

    await disputes.update(
      { id: dispute.id },
      { evidenceWindowExpiresAt: new Date(Date.now() - 1000) },
    );

    const elapsedPacket = await request(server)
      .get(`/disputes/${dispute.id}`)
      .set(auth(arbiter.accessToken));
    expect((elapsedPacket.body as DisputePacketBody).submissionFlags).toEqual({
      buyerSubmitted: true,
      sellerSubmitted: false,
      evidenceWindowElapsed: true,
    });

    await seedEvidence(escrowId, seller.userId, EvidencePhase.AT_DELIVERY);
    const withRebuttalResponse = await request(server)
      .get(`/disputes/${dispute.id}`)
      .set(auth(arbiter.accessToken));
    const withRebuttal = withRebuttalResponse.body as DisputePacketBody;
    expect(withRebuttal.submissionFlags.sellerSubmitted).toBe(true);
    expect(withRebuttal.sellerEvidence).toHaveLength(1);
    expect(withRebuttal.buyerEvidence).toHaveLength(1);
  });

  it('DisputePacket is deterministic across repeated fetches and carries no PII', async () => {
    const { escrowId, buyer, seller } = await createDeliveredEscrow(40_000);
    const dispute = await raiseDispute(escrowId, buyer);
    await seedEvidence(escrowId, seller.userId, EvidencePhase.AT_DELIVERY);
    const arbiter = await registerAndLogin(UserRole.ARBITER);

    const first = await request(server)
      .get(`/disputes/${dispute.id}`)
      .set(auth(arbiter.accessToken));
    const second = await request(server)
      .get(`/disputes/${dispute.id}`)
      .set(auth(arbiter.accessToken));

    expect(first.body).toEqual(second.body);
    const serialized = JSON.stringify(first.body);
    expect(serialized).not.toMatch(/@example\.com/);
  });

  it('only ARBITER/ADMIN may close the evidence window or resolve a dispute', async () => {
    const { escrowId, buyer } = await createDeliveredEscrow(40_000);
    const dispute = await raiseDispute(escrowId, buyer);

    const closeAttempt = await request(server)
      .post(`/disputes/${dispute.id}/close-evidence-window`)
      .set(auth(buyer.accessToken));
    expect(closeAttempt.status).toBe(403);

    const resolveAttempt = await request(server)
      .post(`/disputes/${dispute.id}/resolve`)
      .set(auth(buyer.accessToken))
      .send({ outcome: DisputeResolutionOutcome.RELEASE_TO_SELLER });
    expect(resolveAttempt.status).toBe(403);
  });

  it('RELEASE_TO_SELLER resolution pays the seller price-minus-fee and the platform the fee', async () => {
    const { escrowId, buyer, seller, priceAmount, feeBps } = await createDeliveredEscrow(100_000);
    const dispute = await raiseDispute(escrowId, buyer);
    const arbiter = await registerAndLogin(UserRole.ARBITER);

    await disputeService.closeEvidenceWindow(dispute.id, null);

    const resolveResponse = await request(server)
      .post(`/disputes/${dispute.id}/resolve`)
      .set(auth(arbiter.accessToken))
      .send({ outcome: DisputeResolutionOutcome.RELEASE_TO_SELLER });
    expect(resolveResponse.status).toBe(200);
    expect((resolveResponse.body as DisputeBody).state).toBe(DisputeState.RESOLVED);

    const escrow = await getEscrow(escrowId, buyer.accessToken);
    expect(escrow.state).toBe(EscrowState.RELEASED);

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
  });

  it('REFUND_TO_BUYER resolution credits the buyer with no fee taken', async () => {
    const { escrowId, buyer, priceAmount } = await createDeliveredEscrow(60_000);
    const dispute = await raiseDispute(escrowId, buyer, DisputeReasonCode.NOT_RECEIVED);
    const arbiter = await registerAndLogin(UserRole.ARBITER);

    await disputeService.closeEvidenceWindow(dispute.id, null);
    const resolveResponse = await request(server)
      .post(`/disputes/${dispute.id}/resolve`)
      .set(auth(arbiter.accessToken))
      .send({ outcome: DisputeResolutionOutcome.REFUND_TO_BUYER });
    expect(resolveResponse.status).toBe(200);

    const escrow = await getEscrow(escrowId, buyer.accessToken);
    expect(escrow.state).toBe(EscrowState.REFUNDED);

    expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({
      amount: 0,
      currency: 'NGN',
    });
    expect(await ledger.getBalance(userWalletRef(buyer.userId))).toEqual({
      amount: priceAmount,
      currency: 'NGN',
    });
  });

  it('SPLIT resolution posts a partial release and partial refund that sum exactly to the held amount', async () => {
    const { escrowId, buyer, seller, priceAmount, feeBps } = await createDeliveredEscrow(150_000);
    const dispute = await raiseDispute(escrowId, buyer, DisputeReasonCode.PARTIAL);
    const arbiter = await registerAndLogin(UserRole.ARBITER);

    await disputeService.closeEvidenceWindow(dispute.id, null);
    const resolveResponse = await request(server)
      .post(`/disputes/${dispute.id}/resolve`)
      .set(auth(arbiter.accessToken))
      .send({ outcome: DisputeResolutionOutcome.SPLIT, splitSellerBps: 6_000 });
    expect(resolveResponse.status).toBe(200);

    const escrow = await getEscrow(escrowId, buyer.accessToken);
    expect(escrow.state).toBe(EscrowState.RELEASED);

    const releasedAmount = Math.floor((priceAmount * 6_000) / 10_000);
    const feeAmount = Math.floor((releasedAmount * feeBps) / 10_000);
    const sellerAmount = releasedAmount - feeAmount;
    const buyerAmount = priceAmount - releasedAmount;

    const holding = await ledger.getBalance(escrowHoldingRef(escrowId));
    const sellerBalance = await ledger.getBalance(userWalletRef(seller.userId));
    const buyerBalance = await ledger.getBalance(userWalletRef(buyer.userId));
    const feeBalance = await ledger.getBalance(platformFeeRevenueRef());

    expect(holding).toEqual({ amount: 0, currency: 'NGN' });
    expect(sellerBalance).toEqual({ amount: sellerAmount, currency: 'NGN' });
    expect(buyerBalance).toEqual({ amount: buyerAmount, currency: 'NGN' });
    expect(feeBalance.amount).toBeGreaterThanOrEqual(feeAmount);

    expect(sellerBalance.amount + buyerBalance.amount + feeAmount).toBe(priceAmount);

    const report = await reconciliation.reconcile();
    expect(report.globalBalanced).toBe(true);
  });

  it('resolution is idempotent -- re-submitting the same resolution does not move money twice', async () => {
    const { escrowId, buyer, seller, priceAmount, feeBps } = await createDeliveredEscrow(70_000);
    const dispute = await raiseDispute(escrowId, buyer);
    const arbiter = await registerAndLogin(UserRole.ARBITER);
    await disputeService.closeEvidenceWindow(dispute.id, null);

    const first = await request(server)
      .post(`/disputes/${dispute.id}/resolve`)
      .set(auth(arbiter.accessToken))
      .send({ outcome: DisputeResolutionOutcome.RELEASE_TO_SELLER });
    expect(first.status).toBe(200);

    const second = await request(server)
      .post(`/disputes/${dispute.id}/resolve`)
      .set(auth(arbiter.accessToken))
      .send({ outcome: DisputeResolutionOutcome.RELEASE_TO_SELLER });
    expect(second.status).toBe(200);
    expect((second.body as DisputeBody).state).toBe(DisputeState.RESOLVED);

    const feeAmount = Math.floor((priceAmount * feeBps) / 10_000);
    const sellerAmount = priceAmount - feeAmount;
    expect(await ledger.getBalance(userWalletRef(seller.userId))).toEqual({
      amount: sellerAmount,
      currency: 'NGN',
    });
  });

  it('rejects a SPLIT resolution missing splitSellerBps and rejects splitSellerBps on a non-SPLIT outcome', async () => {
    const { escrowId, buyer } = await createDeliveredEscrow(40_000);
    const dispute = await raiseDispute(escrowId, buyer);
    const arbiter = await registerAndLogin(UserRole.ARBITER);
    await disputeService.closeEvidenceWindow(dispute.id, null);

    const missingRatio = await request(server)
      .post(`/disputes/${dispute.id}/resolve`)
      .set(auth(arbiter.accessToken))
      .send({ outcome: DisputeResolutionOutcome.SPLIT });
    expect(missingRatio.status).toBe(400);

    const spuriousRatio = await request(server)
      .post(`/disputes/${dispute.id}/resolve`)
      .set(auth(arbiter.accessToken))
      .send({ outcome: DisputeResolutionOutcome.RELEASE_TO_SELLER, splitSellerBps: 5_000 });
    expect(spuriousRatio.status).toBe(400);
  });
});
