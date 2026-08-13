import type { Server } from 'node:http';
import { randomUUID, createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import request from 'supertest';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { AppModule } from '../../src/app.module';
import { EscrowState } from '../../src/escrow/entities/escrow-state.enum';
import { EscrowRole } from '../../src/escrow/entities/escrow-role.enum';
import { User } from '../../src/database/entities/user.entity';
import { EvidenceItem } from '../../src/database/entities/evidence-item.entity';
import { LedgerAccount } from '../../src/database/entities/ledger-account.entity';
import { AuditEvent } from '../../src/database/entities/audit-event.entity';
import { ArbitrationRecord } from '../../src/database/entities/arbitration-record.entity';
import { FakePrimaryLlmProvider } from '../../src/arbitration/providers/fake-primary-llm.provider';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { UserRole } from '../../src/users/entities/user-role.enum';
import { DisputeReasonCode } from '../../src/disputes/entities/dispute-reason-code.enum';
import { DisputeResolutionOutcome } from '../../src/disputes/entities/dispute-resolution-outcome.enum';
import { DisputeState } from '../../src/disputes/entities/dispute-state.enum';
import { LedgerService } from '../../src/ledger/ledger.service';
import { ReconciliationService } from '../../src/ledger/reconciliation.service';
import { MetricsService } from '../../src/observability/metrics.service';
import { LoggingAlertsService } from '../../src/observability/logging-alerts.service';
import {
  escrowHoldingRef,
  userWalletRef,
  platformFeeRevenueRef,
  treasuryRef,
} from '../../src/ledger/account-refs';
import { EntryDirection } from '../../src/ledger/entities/entry-direction.enum';
import { Money } from '../../src/common/money/money';
import {
  NOTIFICATION_QUEUE,
  NotificationDeliveryJobData,
} from '../../src/notifications/notification-queue.constants';
import { NotificationEventType } from '../../src/notifications/entities/notification-event-type.enum';
import { RedisService } from '../../src/redis/redis.service';

const PAYSTACK_SECRET = 'test-paystack-secret-key';

interface AuthTokensBody {
  accessToken: string;
  user: { id: string };
}

interface EscrowDetailBody {
  id: string;
  state: EscrowState;
}

interface InviteBody {
  token: string;
}

interface DisputeBody {
  id: string;
  escrowId: string;
  state: DisputeState;
  resolvedArbitrationRecordId: string | null;
}

interface PaymentIntentBody {
  reference: string;
}

interface LedgerPostingBody {
  id: string;
  correlationId: string | null;
  entries: { direction: string; amount: number; currency: string }[];
}

describe('Admin (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let users: Repository<User>;
  let evidenceItems: Repository<EvidenceItem>;
  let ledgerAccounts: Repository<LedgerAccount>;
  let auditEvents: Repository<AuditEvent>;
  let arbitrationRecords: Repository<ArbitrationRecord>;
  let ledger: LedgerService;
  let reconciliation: ReconciliationService;
  let metrics: MetricsService;
  let alerts: LoggingAlertsService;
  let fakePrimary: FakePrimaryLlmProvider;
  let notificationQueue: Queue<NotificationDeliveryJobData>;
  let redis: RedisService;
  let userCounter = 0;

  const password = 'super-secret-password';
  const defaultTerms = {
    inspectionWindowHours: 48,
    deliveryMethod: 'courier',
    itemDescription: 'A vintage camera',
    feeBps: 250,
  };

  function uniqueEmail(): string {
    userCounter += 1;
    return `admin-user-${Date.now()}-${userCounter}@example.com`;
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

  async function createDisputedEscrow(priceAmount: number): Promise<{
    escrowId: string;
    disputeId: string;
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
    const status = await postSignedWebhook({
      event: 'charge.success',
      data: {
        id: `evt-${randomUUID()}`,
        reference: intent.reference,
        amount: priceAmount,
        currency: 'NGN',
        status: 'success',
      },
    });
    expect(status).toBe(200);

    await request(server).post(`/escrows/${draft.id}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${draft.id}/confirm-delivery`)
      .set(auth(buyer.accessToken));

    await seedEvidence(draft.id, buyer.userId, EvidencePhase.AT_DELIVERY);
    const disputeResponse = await request(server)
      .post(`/escrows/${draft.id}/disputes`)
      .set(auth(buyer.accessToken))
      .send({
        reasonCode: DisputeReasonCode.NOT_AS_DESCRIBED,
        statement: 'Item does not match listing.',
      });
    const dispute = disputeResponse.body as DisputeBody;

    return {
      escrowId: draft.id,
      disputeId: dispute.id,
      buyer,
      seller,
      priceAmount,
      feeBps: defaultTerms.feeBps,
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    server = app.getHttpServer() as Server;
    users = app.get<Repository<User>>(getRepositoryToken(User));
    evidenceItems = app.get<Repository<EvidenceItem>>(getRepositoryToken(EvidenceItem));
    ledgerAccounts = app.get<Repository<LedgerAccount>>(getRepositoryToken(LedgerAccount));
    auditEvents = app.get<Repository<AuditEvent>>(getRepositoryToken(AuditEvent));
    arbitrationRecords = app.get<Repository<ArbitrationRecord>>(
      getRepositoryToken(ArbitrationRecord),
    );
    ledger = app.get(LedgerService);
    reconciliation = app.get(ReconciliationService);
    metrics = app.get(MetricsService);
    alerts = app.get(LoggingAlertsService);
    fakePrimary = app.get(FakePrimaryLlmProvider);
    notificationQueue = app.get(getQueueToken(NOTIFICATION_QUEUE));
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
    fakePrimary.reset();
  });

  it('denies a plain USER access to execute a resolution, and executing one as ARBITER links the ArbitrationRecord and writes exactly one AuditEvent', async () => {
    const { disputeId, escrowId, seller, priceAmount, feeBps, buyer } =
      await createDisputedEscrow(100_000);
    const arbiter = await registerAndLogin(UserRole.ARBITER);
    await request(server)
      .post(`/disputes/${disputeId}/close-evidence-window`)
      .set(auth(arbiter.accessToken));

    const deniedAttempt = await request(server)
      .post(`/disputes/${disputeId}/resolve`)
      .set(auth(buyer.accessToken))
      .send({ outcome: DisputeResolutionOutcome.RELEASE_TO_SELLER });
    expect(deniedAttempt.status).toBe(403);

    const resolveResponse = await request(server)
      .post(`/disputes/${disputeId}/resolve`)
      .set(auth(arbiter.accessToken))
      .send({ outcome: DisputeResolutionOutcome.RELEASE_TO_SELLER });
    expect(resolveResponse.status).toBe(200);
    expect((resolveResponse.body as DisputeBody).resolvedArbitrationRecordId).toBeNull();

    const escrowResponse = await request(server)
      .get(`/escrows/${escrowId}`)
      .set(auth(buyer.accessToken));
    expect((escrowResponse.body as EscrowDetailBody).state).toBe(EscrowState.RELEASED);

    const feeAmount = Math.floor((priceAmount * feeBps) / 10_000);
    expect(await ledger.getBalance(userWalletRef(seller.userId))).toEqual({
      amount: priceAmount - feeAmount,
      currency: 'NGN',
    });

    const events = await auditEvents.find({
      where: { entityType: 'dispute', entityId: disputeId },
    });
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('DISPUTE_RESOLUTION_EXECUTED');
  });

  it('executing a resolution referencing an ArbitrationRecord persists the link on the dispute', async () => {
    const { disputeId } = await createDisputedEscrow(80_000);
    const arbiter = await registerAndLogin(UserRole.ARBITER);

    fakePrimary.enqueueResponse(
      JSON.stringify({
        recommendedOutcome: DisputeResolutionOutcome.RELEASE_TO_SELLER,
        confidence: 0.95,
        rationale: 'Delivery photos match creation photos.',
        citedEvidenceIds: ['ev-1'],
        contradictions: [],
        missingEvidence: [],
      }),
    );
    const recommendResponse = await request(server)
      .post(`/disputes/${disputeId}/arbitration-recommendations`)
      .set(auth(arbiter.accessToken));
    expect(recommendResponse.status).toBe(201);
    const record = recommendResponse.body as { id: string };

    await request(server)
      .post(`/disputes/${disputeId}/close-evidence-window`)
      .set(auth(arbiter.accessToken));

    const resolveResponse = await request(server)
      .post(`/disputes/${disputeId}/resolve`)
      .set(auth(arbiter.accessToken))
      .send({
        outcome: DisputeResolutionOutcome.RELEASE_TO_SELLER,
        arbitrationRecordId: record.id,
      });
    expect(resolveResponse.status).toBe(200);
    expect((resolveResponse.body as DisputeBody).resolvedArbitrationRecordId).toBe(record.id);

    const persisted = await arbitrationRecords.findOneOrFail({ where: { id: record.id } });
    expect(persisted.disputeId).toBe(disputeId);

    const events = await auditEvents.find({
      where: { entityType: 'dispute', entityId: disputeId },
    });
    expect(events).toHaveLength(1);
    expect(events[0].reason).toContain(record.id);
  });

  it('rejects an unknown arbitrationRecordId on resolve', async () => {
    const { disputeId } = await createDisputedEscrow(50_000);
    const arbiter = await registerAndLogin(UserRole.ARBITER);

    const response = await request(server)
      .post(`/disputes/${disputeId}/resolve`)
      .set(auth(arbiter.accessToken))
      .send({
        outcome: DisputeResolutionOutcome.RELEASE_TO_SELLER,
        arbitrationRecordId: randomUUID(),
      });

    expect(response.status).toBe(400);
  });

  it('posts an admin ledger adjustment as a balanced compensating posting and audits it, denying non-admins', async () => {
    const admin = await registerAndLogin(UserRole.ADMIN);
    const arbiter = await registerAndLogin(UserRole.ARBITER);

    const deniedAttempt = await request(server)
      .post('/admin/ledger/adjustments')
      .set(auth(arbiter.accessToken))
      .send({
        debitAccountRef: treasuryRef(),
        creditAccountRef: platformFeeRevenueRef(),
        amount: 500,
        currency: 'NGN',
        reason: 'test adjustment',
      });
    expect(deniedAttempt.status).toBe(403);

    const response = await request(server)
      .post('/admin/ledger/adjustments')
      .set(auth(admin.accessToken))
      .send({
        debitAccountRef: treasuryRef(),
        creditAccountRef: platformFeeRevenueRef(),
        amount: 500,
        currency: 'NGN',
        reason: 'correcting a manual fee reversal',
      });
    expect(response.status).toBe(201);
    const posting = response.body as LedgerPostingBody;
    expect(posting.entries).toHaveLength(2);
    const debitTotal = posting.entries
      .filter((e) => e.direction === 'DEBIT')
      .reduce((sum, e) => sum + e.amount, 0);
    const creditTotal = posting.entries
      .filter((e) => e.direction === 'CREDIT')
      .reduce((sum, e) => sum + e.amount, 0);
    expect(debitTotal).toBe(creditTotal);

    const events = await auditEvents.find({
      where: { entityType: 'ledger_posting', entityId: posting.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('LEDGER_ADJUSTMENT_POSTED');
  });

  it('increments the ledger drift metric and fires the alert path when reconciliation detects drift', async () => {
    const escrowId = randomUUID();
    await ledger.postTransaction(
      [
        {
          accountRef: treasuryRef(),
          direction: EntryDirection.DEBIT,
          money: Money.of(10_000, 'NGN'),
        },
        {
          accountRef: escrowHoldingRef(escrowId),
          direction: EntryDirection.CREDIT,
          money: Money.of(10_000, 'NGN'),
        },
      ],
      { idempotencyKey: `drift-admin-${escrowId}` },
    );

    const ref = escrowHoldingRef(escrowId);
    const account = await ledgerAccounts.findOneOrFail({ where: { ref } });
    await ledgerAccounts.update(account.id, { cachedBalance: account.cachedBalance + 777 });

    const before = await metrics.getLedgerDriftTotal();
    const admin = await registerAndLogin(UserRole.ADMIN);
    const response = await request(server)
      .get('/admin/ledger/reconciliation')
      .set(auth(admin.accessToken));
    expect(response.status).toBe(200);
    expect((response.body as { driftedAccountRefs: string[] }).driftedAccountRefs).toContain(ref);

    const after = await metrics.getLedgerDriftTotal();
    expect(after).toBeGreaterThan(before);
    expect(alerts.history().some((alert) => alert.name === 'LEDGER_DRIFT')).toBe(true);

    await ledger.rebuildBalance(ref);
    await reconciliation.reconcile();
  });

  it('propagates the correlationId from the HTTP request onto the ledger posting and the notification job', async () => {
    const { disputeId, buyer, seller } = await createDisputedEscrow(20_000);
    const arbiter = await registerAndLogin(UserRole.ARBITER);
    const correlationId = randomUUID();
    await request(server)
      .post(`/disputes/${disputeId}/close-evidence-window`)
      .set(auth(arbiter.accessToken));

    const resolveResponse = await request(server)
      .post(`/disputes/${disputeId}/resolve`)
      .set(auth(arbiter.accessToken))
      .set('x-correlation-id', correlationId)
      .send({ outcome: DisputeResolutionOutcome.REFUND_TO_BUYER });
    expect(resolveResponse.status).toBe(200);

    const postingsResponse = await request(server)
      .get(`/admin/ledger/postings?correlationId=${correlationId}`)
      .set(auth((await registerAndLogin(UserRole.ADMIN)).accessToken));
    expect(postingsResponse.status).toBe(200);
    const postings = postingsResponse.body as LedgerPostingBody[];
    expect(postings.length).toBeGreaterThan(0);
    expect(postings[0].correlationId).toBe(correlationId);

    const jobs = await notificationQueue.getJobs(['completed', 'waiting', 'active', 'delayed']);
    const resolvedJobs = jobs.filter(
      (job) =>
        job.data.eventType === NotificationEventType.RESOLVED &&
        (job.data.userId === buyer.userId || job.data.userId === seller.userId),
    );
    expect(resolvedJobs.length).toBeGreaterThan(0);
    for (const job of resolvedJobs) {
      expect(job.data.correlationId).toBe(correlationId);
    }
  });
});
