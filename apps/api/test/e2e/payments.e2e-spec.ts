import type { Server } from 'node:http';
import { randomUUID, createHmac } from 'node:crypto';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { EscrowStateMachine } from '../../src/escrow/escrow-state-machine';
import { EscrowState } from '../../src/escrow/entities/escrow-state.enum';
import { EscrowRole } from '../../src/escrow/entities/escrow-role.enum';
import { User } from '../../src/database/entities/user.entity';
import { EvidenceItem } from '../../src/database/entities/evidence-item.entity';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { PaymentIntent } from '../../src/database/entities/payment-intent.entity';
import { PaymentWebhookEvent } from '../../src/database/entities/payment-webhook-event.entity';
import { PaymentIntentStatus } from '../../src/payments/entities/payment-intent-status.enum';
import { FakePaystackProvider } from '../../src/payments/providers/fake-paystack.provider';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { LedgerService } from '../../src/ledger/ledger.service';
import { PaymentsReconciliationService } from '../../src/payments/payments-reconciliation.service';
import { escrowHoldingRef } from '../../src/ledger/account-refs';
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
  id: string;
  escrowId: string;
  amount: number;
  currency: string;
  status: PaymentIntentStatus;
  reference: string;
  authorizationUrl: string | null;
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

describe('Payments (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let stateMachine: EscrowStateMachine;
  let users: Repository<User>;
  let evidenceItems: Repository<EvidenceItem>;
  let paymentIntents: Repository<PaymentIntent>;
  let webhookEvents: Repository<PaymentWebhookEvent>;
  let fakePaystack: FakePaystackProvider;
  let ledger: LedgerService;
  let reconciliation: PaymentsReconciliationService;
  let redis: RedisService;
  let userCounter = 0;
  let eventCounter = 0;

  const password = 'super-secret-password';
  const validTerms = {
    price: { amount: 100_000, currency: 'NGN' as const },
    inspectionWindowHours: 48,
    deliveryMethod: 'courier',
    itemDescription: 'A vintage camera',
    feeBps: 250,
  };

  function uniqueEmail(): string {
    userCounter += 1;
    return `payments-user-${Date.now()}-${userCounter}@example.com`;
  }

  function uniqueEventId(): string {
    eventCounter += 1;
    return `evt-${Date.now()}-${eventCounter}`;
  }

  function auth(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  async function registerAndLogin(): Promise<{ userId: string; accessToken: string }> {
    const email = uniqueEmail();
    await request(server).post('/auth/register').send({ email, password });
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

  async function createDraft(
    accessToken: string,
    price = validTerms.price,
  ): Promise<EscrowDetailBody> {
    const response = await request(server)
      .post('/escrows')
      .set(auth(accessToken))
      .send({ ...validTerms, price, role: EscrowRole.BUYER });
    const draft = response.body as EscrowDetailBody;
    await seedCreationEvidence(draft.id, draft.parties[0].userId);
    return draft;
  }

  async function createAgreedEscrow(price = validTerms.price): Promise<{
    escrowId: string;
    buyer: { userId: string; accessToken: string };
    seller: { userId: string; accessToken: string };
  }> {
    const buyer = await registerAndLogin();
    const seller = await registerAndLogin();
    await grantTier1(buyer.userId);

    const draft = await createDraft(buyer.accessToken, price);
    const inviteResponse = await request(server)
      .post(`/escrows/${draft.id}/invite`)
      .set(auth(buyer.accessToken));
    const invite = inviteResponse.body as InviteBody;

    await request(server).post(`/invites/${invite.token}/accept`).set(auth(seller.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(buyer.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(seller.accessToken));

    return { escrowId: draft.id, buyer, seller };
  }

  async function getEscrow(escrowId: string, accessToken: string): Promise<EscrowDetailBody> {
    const response = await request(server).get(`/escrows/${escrowId}`).set(auth(accessToken));
    return response.body as EscrowDetailBody;
  }

  function sign(rawBody: string, secret = PAYSTACK_SECRET): string {
    return createHmac('sha512', secret).update(rawBody).digest('hex');
  }

  async function postWebhook(
    payload: unknown,
    signature: string | undefined,
  ): Promise<{ status: number; body: unknown }> {
    const rawBody = JSON.stringify(payload);
    const req = request(server)
      .post('/payments/webhook/paystack')
      .set('Content-Type', 'application/json');

    if (signature !== undefined) {
      req.set('x-paystack-signature', signature);
    }

    const response = await req.send(rawBody);
    return { status: response.status, body: response.body as unknown };
  }

  async function postSignedWebhook(payload: unknown): Promise<{ status: number; body: unknown }> {
    const rawBody = JSON.stringify(payload);
    return postWebhook(payload, sign(rawBody));
  }

  function chargeSuccessPayload(reference: string, amount: number, currency = 'NGN'): unknown {
    return {
      event: 'charge.success',
      data: { id: uniqueEventId(), reference, amount, currency, status: 'success' },
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    server = app.getHttpServer() as Server;
    stateMachine = app.get(EscrowStateMachine);
    users = app.get<Repository<User>>(getRepositoryToken(User));
    evidenceItems = app.get<Repository<EvidenceItem>>(getRepositoryToken(EvidenceItem));
    paymentIntents = app.get<Repository<PaymentIntent>>(getRepositoryToken(PaymentIntent));
    webhookEvents = app.get<Repository<PaymentWebhookEvent>>(getRepositoryToken(PaymentWebhookEvent));
    fakePaystack = app.get(FakePaystackProvider);
    ledger = app.get(LedgerService);
    reconciliation = app.get(PaymentsReconciliationService);
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('funds the escrow exactly once on a valid charge.success webhook and posts correct ledger entries', async () => {
    const { escrowId, buyer } = await createAgreedEscrow({ amount: 120_000, currency: 'NGN' });

    const fundResponse = await request(server)
      .post(`/payments/escrows/${escrowId}/fund`)
      .set(auth(buyer.accessToken));
    expect(fundResponse.status).toBe(201);
    const intent = fundResponse.body as PaymentIntentBody;
    expect(intent.status).toBe(PaymentIntentStatus.PENDING);

    const { status } = await postSignedWebhook(chargeSuccessPayload(intent.reference, 120_000));
    expect(status).toBe(200);

    const escrow = await getEscrow(escrowId, buyer.accessToken);
    expect(escrow.state).toBe(EscrowState.FUNDED);

    const fundedIntent = await paymentIntents.findOneOrFail({ where: { id: intent.id } });
    expect(fundedIntent.status).toBe(PaymentIntentStatus.FUNDED);

    expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({
      amount: 120_000,
      currency: 'NGN',
    });
  });

  it('does not double-fund when the same webhook event id is replayed', async () => {
    const { escrowId, buyer } = await createAgreedEscrow({ amount: 80_000, currency: 'NGN' });
    const fundResponse = await request(server)
      .post(`/payments/escrows/${escrowId}/fund`)
      .set(auth(buyer.accessToken));
    const intent = fundResponse.body as PaymentIntentBody;

    const payload = chargeSuccessPayload(intent.reference, 80_000);
    const rawBody = JSON.stringify(payload);
    const signature = sign(rawBody);

    const first = await postWebhook(payload, signature);
    const second = await postWebhook(payload, signature);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({
      amount: 80_000,
      currency: 'NGN',
    });

    const eventCount = await webhookEvents.count({
      where: { provider: 'paystack', providerEventId: (payload as { data: { id: string } }).data.id },
    });
    expect(eventCount).toBe(1);
  });

  it('rejects a webhook with a tampered signature and posts nothing', async () => {
    const { escrowId, buyer } = await createAgreedEscrow({ amount: 55_000, currency: 'NGN' });
    const fundResponse = await request(server)
      .post(`/payments/escrows/${escrowId}/fund`)
      .set(auth(buyer.accessToken));
    const intent = fundResponse.body as PaymentIntentBody;

    const { status, body } = await postWebhook(
      chargeSuccessPayload(intent.reference, 55_000),
      sign('a completely different payload'),
    );

    expect(status).toBe(401);
    expect((body as ErrorBody).code).toBe('INVALID_WEBHOOK_SIGNATURE');

    const escrow = await getEscrow(escrowId, buyer.accessToken);
    expect(escrow.state).toBe(EscrowState.AGREED);
    await expect(ledger.getBalance(escrowHoldingRef(escrowId))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('quarantines a webhook whose amount does not match the intent instead of auto-funding', async () => {
    const { escrowId, buyer } = await createAgreedEscrow({ amount: 90_000, currency: 'NGN' });
    const fundResponse = await request(server)
      .post(`/payments/escrows/${escrowId}/fund`)
      .set(auth(buyer.accessToken));
    const intent = fundResponse.body as PaymentIntentBody;

    const { status } = await postSignedWebhook(chargeSuccessPayload(intent.reference, 1_000));
    expect(status).toBe(200);

    const quarantined = await paymentIntents.findOneOrFail({ where: { id: intent.id } });
    expect(quarantined.status).toBe(PaymentIntentStatus.QUARANTINED);

    const escrow = await getEscrow(escrowId, buyer.accessToken);
    expect(escrow.state).toBe(EscrowState.AGREED);
    await expect(ledger.getBalance(escrowHoldingRef(escrowId))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('blocks funding a DRAFT escrow', async () => {
    const buyer = await registerAndLogin();
    await grantTier1(buyer.userId);
    const draft = await createDraft(buyer.accessToken);

    const response = await request(server)
      .post(`/payments/escrows/${draft.id}/fund`)
      .set(auth(buyer.accessToken));

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).code).toBe('ESCROW_NOT_AGREED');
  });

  it('blocks funding a DISPUTED escrow', async () => {
    const { escrowId, buyer } = await createAgreedEscrow();
    await stateMachine.transition(escrowId, EscrowState.FUNDED, { actorId: null });
    await stateMachine.transition(escrowId, EscrowState.SHIPPED, { actorId: null });
    await stateMachine.transition(escrowId, EscrowState.DELIVERED, { actorId: null });
    await stateMachine.transition(escrowId, EscrowState.DISPUTED, { actorId: null });

    const response = await request(server)
      .post(`/payments/escrows/${escrowId}/fund`)
      .set(auth(buyer.accessToken));

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).code).toBe('ESCROW_NOT_AGREED');
  });

  it('leaves the escrow unfunded when only a client-side success is reported and no webhook ever arrives', async () => {
    const { escrowId, buyer } = await createAgreedEscrow({ amount: 40_000, currency: 'NGN' });
    await request(server).post(`/payments/escrows/${escrowId}/fund`).set(auth(buyer.accessToken));

    const escrow = await getEscrow(escrowId, buyer.accessToken);
    expect(escrow.state).toBe(EscrowState.AGREED);
  });

  it('reconciliation flags an orphan provider charge and a funded intent with no matching charge', async () => {
    const { escrowId, buyer } = await createAgreedEscrow({ amount: 60_000, currency: 'NGN' });
    const fundResponse = await request(server)
      .post(`/payments/escrows/${escrowId}/fund`)
      .set(auth(buyer.accessToken));
    const intent = fundResponse.body as PaymentIntentBody;

    await postSignedWebhook(chargeSuccessPayload(intent.reference, 60_000));

    // Anchor the reconciliation window to the DB's own clock (via the persisted
    // intent's createdAt) rather than the test process's Date.now() -- the two
    // can disagree by a meaningful margin depending on how the Postgres
    // container's clock is configured, which would otherwise make this test
    // flaky for reasons that have nothing to do with reconciliation itself.
    const persistedIntent = await paymentIntents.findOneOrFail({ where: { id: intent.id } });
    const anchor = persistedIntent.createdAt;

    const orphanReference = `orphan-${randomUUID()}`;
    fakePaystack.seedTransaction({
      reference: orphanReference,
      amountKobo: 12_345,
      currency: 'NGN',
      status: 'success',
      paidAt: anchor,
    });

    const report = await reconciliation.reconcile({
      from: new Date(anchor.getTime() - 5 * 60_000),
      to: new Date(anchor.getTime() + 5 * 60_000),
    });

    expect(report.orphanProviderReferences).toContain(orphanReference);
    expect(report.unmatchedFundedIntentIds).toContain(intent.id);
  });
});
