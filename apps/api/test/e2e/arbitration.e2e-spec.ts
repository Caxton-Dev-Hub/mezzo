import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
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
import { ArbitrationRecord } from '../../src/database/entities/arbitration-record.entity';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { UserRole } from '../../src/users/entities/user-role.enum';
import { DisputeReasonCode } from '../../src/disputes/entities/dispute-reason-code.enum';
import { DisputeResolutionOutcome } from '../../src/disputes/entities/dispute-resolution-outcome.enum';
import { DisputeService } from '../../src/disputes/dispute.service';
import { FakePrimaryLlmProvider } from '../../src/arbitration/providers/fake-primary-llm.provider';
import { FakeFallbackLlmProvider } from '../../src/arbitration/providers/fake-fallback-llm.provider';
import { RedisService } from '../../src/redis/redis.service';

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
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

interface ArbitrationRecordBody {
  id: string;
  disputeId: string;
  provider: string;
  status: 'RECOMMENDED' | 'NEEDS_HUMAN';
  recommendedOutcome: DisputeResolutionOutcome | null;
  splitRatio: number | null;
  confidence: number;
  citedEvidenceIds: string[];
  contradictions: string[];
  missingEvidence: string[];
  abstentionReason: string | null;
}

function validRecommendation(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    recommendedOutcome: DisputeResolutionOutcome.RELEASE_TO_SELLER,
    confidence: 0.92,
    rationale: 'Buyer delivery photos match seller creation photos and shipping proof is valid.',
    citedEvidenceIds: ['ev-1', 'ev-2'],
    contradictions: [],
    missingEvidence: [],
    ...overrides,
  });
}

describe('Arbitration (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let disputeService: DisputeService;
  let users: Repository<User>;
  let evidenceItems: Repository<EvidenceItem>;
  let arbitrationRecords: Repository<ArbitrationRecord>;
  let fakePrimary: FakePrimaryLlmProvider;
  let fakeFallback: FakeFallbackLlmProvider;
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
    return `arbitration-user-${Date.now()}-${userCounter}@example.com`;
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

  async function seedEvidence(escrowId: string, uploaderId: string, phase: EvidencePhase): Promise<void> {
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

  async function createDisputedEscrow(): Promise<{
    escrowId: string;
    disputeId: string;
    buyer: { userId: string; accessToken: string };
    seller: { userId: string; accessToken: string };
  }> {
    const buyer = await registerAndLogin();
    const seller = await registerAndLogin();
    await grantTier1(buyer.userId);

    const draftResponse = await request(server)
      .post('/escrows')
      .set(auth(buyer.accessToken))
      .send({
        ...defaultTerms,
        price: { amount: 40_000, currency: 'NGN' },
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
    const intent = fundResponse.body as { reference: string };

    const rawBody = JSON.stringify({
      event: 'charge.success',
      data: { id: `evt-${randomUUID()}`, reference: intent.reference, amount: 40_000, currency: 'NGN', status: 'success' },
    });
    const { createHmac } = await import('node:crypto');
    const signature = createHmac('sha512', 'test-paystack-secret-key').update(rawBody).digest('hex');
    await request(server)
      .post('/payments/webhook/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(rawBody);

    await request(server).post(`/escrows/${draft.id}/ship`).set(auth(seller.accessToken)).send({});
    await request(server).post(`/escrows/${draft.id}/confirm-delivery`).set(auth(buyer.accessToken));

    await seedEvidence(draft.id, buyer.userId, EvidencePhase.AT_DELIVERY);
    const disputeResponse = await request(server)
      .post(`/escrows/${draft.id}/disputes`)
      .set(auth(buyer.accessToken))
      .send({ reasonCode: DisputeReasonCode.NOT_AS_DESCRIBED, statement: 'Item does not match listing.' });
    const dispute = disputeResponse.body as DisputeBody;

    return { escrowId: draft.id, disputeId: dispute.id, buyer, seller };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    server = app.getHttpServer() as Server;
    disputeService = app.get(DisputeService);
    users = app.get<Repository<User>>(getRepositoryToken(User));
    evidenceItems = app.get<Repository<EvidenceItem>>(getRepositoryToken(EvidenceItem));
    arbitrationRecords = app.get<Repository<ArbitrationRecord>>(getRepositoryToken(ArbitrationRecord));
    fakePrimary = app.get(FakePrimaryLlmProvider);
    fakeFallback = app.get(FakeFallbackLlmProvider);
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
    fakePrimary.reset();
    fakeFallback.reset();
  });

  it('denies a plain USER access to request or list recommendations', async () => {
    const { disputeId, buyer } = await createDisputedEscrow();

    const requestAttempt = await request(server)
      .post(`/disputes/${disputeId}/arbitration-recommendations`)
      .set(auth(buyer.accessToken));
    expect(requestAttempt.status).toBe(403);

    const listAttempt = await request(server)
      .get(`/disputes/${disputeId}/arbitration-recommendations`)
      .set(auth(buyer.accessToken));
    expect(listAttempt.status).toBe(403);
  });

  it('persists exactly one immutable ArbitrationRecord with the full trace for a confident recommendation', async () => {
    const { disputeId } = await createDisputedEscrow();
    const arbiter = await registerAndLogin(UserRole.ARBITER);
    fakePrimary.enqueueResponse(validRecommendation());

    const response = await request(server)
      .post(`/disputes/${disputeId}/arbitration-recommendations`)
      .set(auth(arbiter.accessToken));

    expect(response.status).toBe(201);
    const body = response.body as ArbitrationRecordBody;
    expect(body.status).toBe('RECOMMENDED');
    expect(body.recommendedOutcome).toBe(DisputeResolutionOutcome.RELEASE_TO_SELLER);
    expect(body.provider).toBe('FAKE_PRIMARY');
    expect(body.citedEvidenceIds).toEqual(['ev-1', 'ev-2']);

    const rows = await arbitrationRecords.find({ where: { disputeId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].rawResponse).toContain('RELEASE_TO_SELLER');
  });

  it('never crashes on a malformed model response and downgrades to NEEDS_HUMAN', async () => {
    const { disputeId } = await createDisputedEscrow();
    const arbiter = await registerAndLogin(UserRole.ARBITER);
    fakePrimary.enqueueResponse('I am not able to help with this request.');

    const response = await request(server)
      .post(`/disputes/${disputeId}/arbitration-recommendations`)
      .set(auth(arbiter.accessToken));

    expect(response.status).toBe(201);
    const body = response.body as ArbitrationRecordBody;
    expect(body.status).toBe('NEEDS_HUMAN');
    expect(body.abstentionReason).toBe('PARSE_FAILURE');
    expect(body.recommendedOutcome).toBeNull();
  });

  it('downgrades a recommendation citing no evidence to NEEDS_HUMAN', async () => {
    const { disputeId } = await createDisputedEscrow();
    const arbiter = await registerAndLogin(UserRole.ARBITER);
    fakePrimary.enqueueResponse(validRecommendation({ citedEvidenceIds: [] }));

    const response = await request(server)
      .post(`/disputes/${disputeId}/arbitration-recommendations`)
      .set(auth(arbiter.accessToken));

    expect(response.status).toBe(201);
    const body = response.body as ArbitrationRecordBody;
    expect(body.status).toBe('NEEDS_HUMAN');
    expect(body.abstentionReason).toBe('NO_CITED_EVIDENCE');
  });

  it('routes below-threshold confidence to NEEDS_HUMAN even when an outcome is proposed', async () => {
    const { disputeId } = await createDisputedEscrow();
    const arbiter = await registerAndLogin(UserRole.ARBITER);
    fakePrimary.enqueueResponse(validRecommendation({ confidence: 0.3 }));

    const response = await request(server)
      .post(`/disputes/${disputeId}/arbitration-recommendations`)
      .set(auth(arbiter.accessToken));

    expect(response.status).toBe(201);
    const body = response.body as ArbitrationRecordBody;
    expect(body.status).toBe('NEEDS_HUMAN');
    expect(body.abstentionReason).toBe('LOW_CONFIDENCE');
    expect(body.recommendedOutcome).toBe(DisputeResolutionOutcome.RELEASE_TO_SELLER);
  });

  it('falls back to the secondary provider when the primary errors', async () => {
    const { disputeId } = await createDisputedEscrow();
    const arbiter = await registerAndLogin(UserRole.ARBITER);
    fakePrimary.enqueueError(new Error('primary provider unavailable'));
    fakeFallback.enqueueResponse(validRecommendation({ recommendedOutcome: DisputeResolutionOutcome.REFUND_TO_BUYER }));

    const response = await request(server)
      .post(`/disputes/${disputeId}/arbitration-recommendations`)
      .set(auth(arbiter.accessToken));

    expect(response.status).toBe(201);
    const body = response.body as ArbitrationRecordBody;
    expect(body.provider).toBe('FAKE_FALLBACK');
    expect(body.status).toBe('RECOMMENDED');
    expect(body.recommendedOutcome).toBe(DisputeResolutionOutcome.REFUND_TO_BUYER);
  });

  it('flags the dispute for a human without auto-resolving it when both providers error', async () => {
    const { disputeId, escrowId, buyer } = await createDisputedEscrow();
    const arbiter = await registerAndLogin(UserRole.ARBITER);
    fakePrimary.enqueueError(new Error('primary provider unavailable'));
    fakeFallback.enqueueError(new Error('fallback provider unavailable'));

    const response = await request(server)
      .post(`/disputes/${disputeId}/arbitration-recommendations`)
      .set(auth(arbiter.accessToken));

    expect(response.status).toBe(201);
    const body = response.body as ArbitrationRecordBody;
    expect(body.status).toBe('NEEDS_HUMAN');
    expect(body.abstentionReason).toBe('PROVIDER_ERROR');
    expect(body.recommendedOutcome).toBeNull();

    const escrowResponse = await request(server).get(`/escrows/${escrowId}`).set(auth(buyer.accessToken));
    expect((escrowResponse.body as EscrowDetailBody).state).toBe(EscrowState.DISPUTED);
  });

  it('lists recommendations for a dispute newest-first', async () => {
    const { disputeId } = await createDisputedEscrow();
    const arbiter = await registerAndLogin(UserRole.ARBITER);

    fakePrimary.enqueueResponse(validRecommendation());
    await request(server)
      .post(`/disputes/${disputeId}/arbitration-recommendations`)
      .set(auth(arbiter.accessToken));

    fakePrimary.enqueueResponse(validRecommendation({ confidence: 0.99 }));
    await request(server)
      .post(`/disputes/${disputeId}/arbitration-recommendations`)
      .set(auth(arbiter.accessToken));

    const listResponse = await request(server)
      .get(`/disputes/${disputeId}/arbitration-recommendations`)
      .set(auth(arbiter.accessToken));

    expect(listResponse.status).toBe(200);
    const records = listResponse.body as ArbitrationRecordBody[];
    expect(records).toHaveLength(2);
    expect(records[0].confidence).toBe(0.99);
  });

  it('refuses to generate a recommendation for an already-resolved dispute', async () => {
    const { disputeId } = await createDisputedEscrow();
    const arbiter = await registerAndLogin(UserRole.ARBITER);
    await disputeService.closeEvidenceWindow(disputeId, null);
    await request(server)
      .post(`/disputes/${disputeId}/resolve`)
      .set(auth(arbiter.accessToken))
      .send({ outcome: DisputeResolutionOutcome.RELEASE_TO_SELLER });

    fakePrimary.enqueueResponse(validRecommendation());
    const response = await request(server)
      .post(`/disputes/${disputeId}/arbitration-recommendations`)
      .set(auth(arbiter.accessToken));

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).code).toBe('DISPUTE_ALREADY_RESOLVED');
  });
});
