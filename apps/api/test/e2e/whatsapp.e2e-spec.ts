import type { Server } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { EscrowState } from '../../src/escrow/entities/escrow-state.enum';
import { EscrowRole } from '../../src/escrow/entities/escrow-role.enum';
import { User } from '../../src/database/entities/user.entity';
import { Escrow } from '../../src/database/entities/escrow.entity';
import { AuditEvent } from '../../src/database/entities/audit-event.entity';
import { WhatsAppAccount } from '../../src/database/entities/whatsapp-account.entity';
import { EvidenceItem } from '../../src/database/entities/evidence-item.entity';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { UserRole } from '../../src/users/entities/user-role.enum';
import { LedgerService } from '../../src/ledger/ledger.service';
import { escrowHoldingRef, userWalletRef } from '../../src/ledger/account-refs';
import { RedisService } from '../../src/redis/redis.service';
import { FakeWhatsAppClient } from '../../src/whatsapp/client/fake-whatsapp.client';

const PAYSTACK_SECRET = 'test-paystack-secret-key';
const WHATSAPP_APP_SECRET = 'test-whatsapp-app-secret';
const WHATSAPP_VERIFY_TOKEN = 'test-whatsapp-verify-token';

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

interface PaymentIntentBody {
  reference: string;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('waitFor: condition not met before timeout');
}

describe('WhatsApp bot (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let users: Repository<User>;
  let escrows: Repository<Escrow>;
  let auditEvents: Repository<AuditEvent>;
  let whatsappAccounts: Repository<WhatsAppAccount>;
  let evidenceItems: Repository<EvidenceItem>;
  let ledger: LedgerService;
  let redis: RedisService;
  let whatsappClient: FakeWhatsAppClient;
  let userCounter = 0;
  let eventCounter = 0;
  let phoneCounter = 0;
  let waMessageCounter = 0;

  const password = 'super-secret-password';
  const defaultTerms = {
    inspectionWindowHours: 48,
    deliveryMethod: 'courier',
    itemDescription: 'A vintage camera',
    feeBps: 250,
  };

  function uniqueEmail(): string {
    userCounter += 1;
    return `wa-user-${Date.now()}-${userCounter}@example.com`;
  }

  function uniqueEventId(): string {
    eventCounter += 1;
    return `evt-wa-${Date.now()}-${eventCounter}`;
  }

  function uniquePhone(): string {
    phoneCounter += 1;
    return `+2348${(100000000 + phoneCounter).toString().padStart(9, '0')}`;
  }

  function uniqueWaMessageId(): string {
    waMessageCounter += 1;
    return `wamid.${Date.now()}.${waMessageCounter}`;
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

  function signPaystack(rawBody: string): string {
    return createHmac('sha512', PAYSTACK_SECRET).update(rawBody).digest('hex');
  }

  async function postSignedPaystackWebhook(payload: unknown): Promise<number> {
    const rawBody = JSON.stringify(payload);
    const response = await request(server)
      .post('/payments/webhook/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signPaystack(rawBody))
      .send(rawBody);
    return response.status;
  }

  function chargeSuccessPayload(reference: string, amount: number, currency = 'NGN'): unknown {
    return {
      event: 'charge.success',
      data: { id: uniqueEventId(), reference, amount, currency, status: 'success' },
    };
  }

  async function createEscrow(
    priceAmount: number,
  ): Promise<{
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
    const status = await postSignedPaystackWebhook(chargeSuccessPayload(intent.reference, priceAmount));
    expect(status).toBe(200);

    return { escrowId: draft.id, buyer, seller, priceAmount, feeBps: defaultTerms.feeBps };
  }

  async function shipAndDeliver(escrowId: string, seller: { accessToken: string }, buyer: { accessToken: string }): Promise<void> {
    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server).post(`/escrows/${escrowId}/confirm-delivery`).set(auth(buyer.accessToken));
  }

  function webhookPayload(waMessageId: string, from: string, text: string): unknown {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                messages: [{ id: waMessageId, from, type: 'text', text: { body: text } }],
              },
            },
          ],
        },
      ],
    };
  }

  function signWhatsApp(rawBody: string): string {
    return `sha256=${createHmac('sha256', WHATSAPP_APP_SECRET).update(rawBody).digest('hex')}`;
  }

  async function postWhatsAppWebhook(
    payload: unknown,
    options: { signed?: boolean } = {},
  ): Promise<{ status: number }> {
    const signed = options.signed ?? true;
    const rawBody = JSON.stringify(payload);
    const req = request(server).post('/whatsapp/webhook').set('Content-Type', 'application/json');
    if (signed) {
      req.set('x-hub-signature-256', signWhatsApp(rawBody));
    }
    const response = await req.send(rawBody);
    return { status: response.status };
  }

  async function sendWhatsAppMessage(from: string, text: string): Promise<string> {
    const waMessageId = uniqueWaMessageId();
    const { status } = await postWhatsAppWebhook(webhookPayload(waMessageId, from, text));
    expect(status).toBe(200);
    return waMessageId;
  }

  /**
   * Inbound webhook processing happens off the request path via BullMQ, so every
   * multi-step conversation in these tests must wait for each reply before sending
   * the next message — otherwise a later assertion can race an earlier reply.
   */
  async function sendAndAwaitReply(phone: string, text: string): Promise<string> {
    whatsappClient.clear();
    await sendWhatsAppMessage(phone, text);
    await waitFor(() => Promise.resolve(whatsappClient.sent.length >= 1));
    return whatsappClient.lastMessageTo(phone)?.body ?? '';
  }

  async function linkWhatsApp(user: { accessToken: string; userId: string }): Promise<string> {
    const phone = uniquePhone();
    const startResponse = await request(server)
      .post('/whatsapp/link/start')
      .set(auth(user.accessToken))
      .send({ phoneNumber: phone });
    expect(startResponse.status).toBe(202);

    const sentToPhone = whatsappClient.lastMessageTo(phone);
    const match = /is (\d{6})\./.exec(sentToPhone?.body ?? '');
    expect(match).not.toBeNull();
    const code = match![1];

    await sendWhatsAppMessage(phone, code);
    await waitFor(async () => {
      const account = await whatsappAccounts.findOne({ where: { phoneNumber: phone } });
      return account !== null;
    }, 5000);

    return phone;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    server = app.getHttpServer() as Server;
    users = app.get<Repository<User>>(getRepositoryToken(User));
    escrows = app.get<Repository<Escrow>>(getRepositoryToken(Escrow));
    auditEvents = app.get<Repository<AuditEvent>>(getRepositoryToken(AuditEvent));
    whatsappAccounts = app.get<Repository<WhatsAppAccount>>(getRepositoryToken(WhatsAppAccount));
    evidenceItems = app.get<Repository<EvidenceItem>>(getRepositoryToken(EvidenceItem));
    ledger = app.get(LedgerService);
    redis = app.get(RedisService);
    whatsappClient = app.get(FakeWhatsAppClient);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
    whatsappClient.clear();
  });

  describe('webhook ingress', () => {
    it('rejects a request with a missing or invalid signature, with no side effects', async () => {
      const waMessageId = uniqueWaMessageId();
      const { status } = await postWhatsAppWebhook(
        webhookPayload(waMessageId, uniquePhone(), 'HELP'),
        { signed: false },
      );

      expect(status).toBe(401);
      const claimed = await redis.get(`whatsapp:inbound:${waMessageId}`);
      expect(claimed).toBeNull();
    });

    it('rejects a request signed with the wrong secret', async () => {
      const waMessageId = uniqueWaMessageId();
      const rawBody = JSON.stringify(webhookPayload(waMessageId, uniquePhone(), 'HELP'));
      const response = await request(server)
        .post('/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', `sha256=${createHmac('sha256', 'wrong-secret').update(rawBody).digest('hex')}`)
        .send(rawBody);

      expect(response.status).toBe(401);
    });

    it('is a no-op the second time the same message id is redelivered', async () => {
      const buyer = await registerAndLogin();
      const phone = await linkWhatsApp(buyer);
      whatsappClient.clear();

      const waMessageId = uniqueWaMessageId();
      const payload = webhookPayload(waMessageId, phone, 'HELP');

      const first = await postWhatsAppWebhook(payload);
      expect(first.status).toBe(200);
      await waitFor(() => Promise.resolve(whatsappClient.sent.length >= 1));
      expect(whatsappClient.sent).toHaveLength(1);

      const second = await postWhatsAppWebhook(payload);
      expect(second.status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(whatsappClient.sent).toHaveLength(1);
    });

    it('answers the verification handshake with the challenge when the token matches', async () => {
      const response = await request(server)
        .get('/whatsapp/webhook')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': WHATSAPP_VERIFY_TOKEN, 'hub.challenge': 'echo-123' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('echo-123');
    });

    it('refuses the verification handshake with the wrong token', async () => {
      const response = await request(server)
        .get('/whatsapp/webhook')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'echo-123' });

      expect(response.status).toBe(403);
    });
  });

  describe('account linking', () => {
    it('refuses commands from an unlinked number', async () => {
      const phone = uniquePhone();
      await sendWhatsAppMessage(phone, 'STATUS ESC-000001');

      await waitFor(() => Promise.resolve(whatsappClient.sent.length >= 1));
      expect(whatsappClient.lastMessageTo(phone)?.body).toMatch(/not linked/i);
    });

    it('links a number only after the correct code is replied, and records an audit event', async () => {
      const buyer = await registerAndLogin();
      const phone = await linkWhatsApp(buyer);

      const account = await whatsappAccounts.findOne({ where: { phoneNumber: phone } });
      expect(account?.userId).toBe(buyer.userId);
      expect(account?.verifiedAt).toBeInstanceOf(Date);

      const linkAudit = await auditEvents.find({
        where: { action: 'WHATSAPP_ACCOUNT_LINKED', entityId: buyer.userId },
      });
      expect(linkAudit).toHaveLength(1);
    });

    it('rejects a wrong linking code without linking the number', async () => {
      const buyer = await registerAndLogin();
      const phone = uniquePhone();
      const startResponse = await request(server)
        .post('/whatsapp/link/start')
        .set(auth(buyer.accessToken))
        .send({ phoneNumber: phone });
      expect(startResponse.status).toBe(202);

      const reply = await sendAndAwaitReply(phone, '000000');

      expect(reply).toMatch(/invalid|expired/i);
      const account = await whatsappAccounts.findOne({ where: { phoneNumber: phone } });
      expect(account).toBeNull();
    });
  });

  describe('read-only commands', () => {
    it('reports escrow status and lists escrows once linked', async () => {
      const { escrowId, buyer, seller } = await createEscrow(50_000);
      await shipAndDeliver(escrowId, seller, buyer);
      const phone = await linkWhatsApp(buyer);
      whatsappClient.clear();

      const escrow = await escrows.findOne({ where: { id: escrowId } });

      await sendWhatsAppMessage(phone, `STATUS ${escrow!.code}`);
      await waitFor(() => Promise.resolve(whatsappClient.sent.length >= 1));
      expect(whatsappClient.lastMessageTo(phone)?.body).toContain('DELIVERED');

      whatsappClient.clear();
      await sendWhatsAppMessage(phone, 'LIST');
      await waitFor(() => Promise.resolve(whatsappClient.sent.length >= 1));
      expect(whatsappClient.lastMessageTo(phone)?.body).toContain(escrow!.code);
    });
  });

  describe('release funds — step-up PIN', () => {
    it('refuses to release without a PIN set first', async () => {
      const { escrowId, buyer, seller } = await createEscrow(50_000);
      await shipAndDeliver(escrowId, seller, buyer);
      const phone = await linkWhatsApp(buyer);
      const escrow = await escrows.findOne({ where: { id: escrowId } });
      whatsappClient.clear();

      await sendWhatsAppMessage(phone, `RELEASE ${escrow!.code}`);

      await waitFor(() => Promise.resolve(whatsappClient.sent.length >= 1));
      expect(whatsappClient.lastMessageTo(phone)?.body).toMatch(/pin/i);
      const after = await escrows.findOne({ where: { id: escrowId } });
      expect(after!.state).toBe(EscrowState.DELIVERED);
    });

    it('does not move money on a wrong PIN, and locks out after too many attempts', async () => {
      const { escrowId, buyer, seller } = await createEscrow(50_000);
      await shipAndDeliver(escrowId, seller, buyer);
      const phone = await linkWhatsApp(buyer);
      const escrow = await escrows.findOne({ where: { id: escrowId } });
      await sendAndAwaitReply(phone, 'PIN SET 1234');
      await sendAndAwaitReply(phone, `RELEASE ${escrow!.code}`);

      const firstAttempt = await sendAndAwaitReply(phone, '0000');
      expect(firstAttempt).toMatch(/incorrect/i);

      const secondAttempt = await sendAndAwaitReply(phone, '0000');
      expect(secondAttempt).toMatch(/incorrect/i);

      const thirdAttempt = await sendAndAwaitReply(phone, '0000');
      expect(thirdAttempt).toMatch(/locked|later/i);

      const after = await escrows.findOne({ where: { id: escrowId } });
      expect(after!.state).toBe(EscrowState.DELIVERED);
      expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({
        amount: 50_000,
        currency: 'NGN',
      });
    });

    it('cannot be resumed once the confirmation session has expired', async () => {
      const { escrowId, buyer, seller } = await createEscrow(50_000);
      await shipAndDeliver(escrowId, seller, buyer);
      const phone = await linkWhatsApp(buyer);
      const escrow = await escrows.findOne({ where: { id: escrowId } });
      await sendAndAwaitReply(phone, 'PIN SET 1234');
      await sendAndAwaitReply(phone, `RELEASE ${escrow!.code}`);

      await redis.del(`whatsapp:session:${phone}`);

      await sendAndAwaitReply(phone, '1234');

      const after = await escrows.findOne({ where: { id: escrowId } });
      expect(after!.state).toBe(EscrowState.DELIVERED);
    });

    it('releases funds exactly once on a correct PIN, matching the confirmed amount, and records exactly one audit event', async () => {
      const { escrowId, buyer, seller, priceAmount, feeBps } = await createEscrow(100_000);
      await shipAndDeliver(escrowId, seller, buyer);
      const phone = await linkWhatsApp(buyer);
      const escrow = await escrows.findOne({ where: { id: escrowId } });
      await sendAndAwaitReply(phone, 'PIN SET 1234');

      const releasePrompt = await sendAndAwaitReply(phone, `RELEASE ${escrow!.code}`);
      const feeAmount = Math.floor((priceAmount * feeBps) / 10_000);
      const sellerAmount = priceAmount - feeAmount;
      expect(releasePrompt).toContain((sellerAmount / 100).toFixed(2));

      const releaseConfirmation = await sendAndAwaitReply(phone, '1234');
      expect(releaseConfirmation).toMatch(/released/i);

      const after = await escrows.findOne({ where: { id: escrowId } });
      expect(after!.state).toBe(EscrowState.RELEASED);

      expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({
        amount: 0,
        currency: 'NGN',
      });
      expect(await ledger.getBalance(userWalletRef(seller.userId, 'NGN'))).toEqual({
        amount: sellerAmount,
        currency: 'NGN',
      });

      const releaseAudit = await auditEvents.find({
        where: { action: 'WHATSAPP_RELEASE_FUNDS', entityId: escrowId },
      });
      expect(releaseAudit).toHaveLength(1);
      expect(releaseAudit[0].actorId).toBe(buyer.userId);
    });

    it('surfaces the same IllegalTransitionError the REST API would when releasing before delivery is confirmed', async () => {
      const { escrowId, buyer, seller } = await createEscrow(50_000);
      await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
      const phone = await linkWhatsApp(buyer);
      const escrow = await escrows.findOne({ where: { id: escrowId } });
      await sendAndAwaitReply(phone, 'PIN SET 1234');
      await sendAndAwaitReply(phone, `RELEASE ${escrow!.code}`);

      const reply = await sendAndAwaitReply(phone, '1234');

      expect(reply).toMatch(/cannot transition/i);
      const after = await escrows.findOne({ where: { id: escrowId } });
      expect(after!.state).toBe(EscrowState.SHIPPED);

      const releaseAudit = await auditEvents.find({
        where: { action: 'WHATSAPP_RELEASE_FUNDS', entityId: escrowId },
      });
      expect(releaseAudit).toHaveLength(0);
    });
  });

  describe('approve delivery — step-up PIN', () => {
    it('confirms delivery over WhatsApp and starts the inspection window, recording an audit event', async () => {
      const { escrowId, buyer, seller } = await createEscrow(50_000);
      await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
      const phone = await linkWhatsApp(buyer);
      const escrow = await escrows.findOne({ where: { id: escrowId } });
      await sendAndAwaitReply(phone, 'PIN SET 1234');
      await sendAndAwaitReply(phone, `APPROVE ${escrow!.code}`);

      const reply = await sendAndAwaitReply(phone, '1234');
      expect(reply).toMatch(/confirmed/i);

      const after = await escrows.findOne({ where: { id: escrowId } });
      expect(after!.state).toBe(EscrowState.DELIVERED);

      const approveAudit = await auditEvents.find({
        where: { action: 'WHATSAPP_APPROVE_DELIVERY', entityId: escrowId },
      });
      expect(approveAudit).toHaveLength(1);
    });
  });

  describe('transactional feature flag', () => {
    afterEach(async () => {
      const admin = await registerAndLogin(UserRole.ADMIN);
      await request(server)
        .post('/admin/settings/whatsapp-transactional')
        .set(auth(admin.accessToken))
        .send({ enabled: true, reason: 'restore for other tests' });
    });

    it('disables RELEASE at runtime without a deploy, while leaving STATUS and LIST working', async () => {
      const { escrowId, buyer, seller } = await createEscrow(50_000);
      await shipAndDeliver(escrowId, seller, buyer);
      const phone = await linkWhatsApp(buyer);
      const escrow = await escrows.findOne({ where: { id: escrowId } });

      const admin = await registerAndLogin(UserRole.ADMIN);
      const toggleResponse = await request(server)
        .post('/admin/settings/whatsapp-transactional')
        .set(auth(admin.accessToken))
        .send({ enabled: false, reason: 'incident drill' });
      expect(toggleResponse.status).toBe(200);
      expect(toggleResponse.body).toEqual({ whatsappTransactionalEnabled: false });

      whatsappClient.clear();
      await sendWhatsAppMessage(phone, `RELEASE ${escrow!.code}`);
      await waitFor(() => Promise.resolve(whatsappClient.sent.length >= 1));
      expect(whatsappClient.lastMessageTo(phone)?.body).toMatch(/temporarily disabled/i);

      whatsappClient.clear();
      await sendWhatsAppMessage(phone, 'LIST');
      await waitFor(() => Promise.resolve(whatsappClient.sent.length >= 1));
      expect(whatsappClient.lastMessageTo(phone)?.body).not.toMatch(/temporarily disabled/i);

      whatsappClient.clear();
      await sendWhatsAppMessage(phone, `STATUS ${escrow!.code}`);
      await waitFor(() => Promise.resolve(whatsappClient.sent.length >= 1));
      expect(whatsappClient.lastMessageTo(phone)?.body).toContain('DELIVERED');

      const after = await escrows.findOne({ where: { id: escrowId } });
      expect(after!.state).toBe(EscrowState.DELIVERED);
    });

    it('a non-admin cannot flip the transactional flag', async () => {
      const buyer = await registerAndLogin();
      const response = await request(server)
        .post('/admin/settings/whatsapp-transactional')
        .set(auth(buyer.accessToken))
        .send({ enabled: false, reason: 'not allowed' });

      expect(response.status).toBe(403);
    });
  });

  describe('outbound notifications', () => {
    it('delivers a state-transition notification over WhatsApp exactly once to a linked recipient', async () => {
      const { escrowId, buyer, seller } = await createEscrow(50_000);
      const phone = await linkWhatsApp(buyer);
      whatsappClient.clear();

      await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});

      await waitFor(
        () => Promise.resolve(whatsappClient.sent.some((message) => message.to === phone)),
        15000,
      );
      const toBuyer = whatsappClient.sent.filter((message) => message.to === phone);
      expect(toBuyer).toHaveLength(1);
    });

    it('opts a user out of WhatsApp notifications on request, without breaking commands', async () => {
      const { escrowId, buyer, seller } = await createEscrow(50_000);
      const phone = await linkWhatsApp(buyer);

      const optOutReply = await sendAndAwaitReply(phone, 'OPTOUT');
      expect(optOutReply).toMatch(/opted out/i);
      const account = await whatsappAccounts.findOne({ where: { userId: buyer.userId } });
      expect(account?.notificationsOptedOutAt).toBeInstanceOf(Date);

      whatsappClient.clear();
      await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(whatsappClient.sent.some((message) => message.to === phone)).toBe(false);

      const reply = await sendAndAwaitReply(
        phone,
        `STATUS ${(await escrows.findOne({ where: { id: escrowId } }))!.code}`,
      );
      expect(reply).toContain('Escrow');
    });
  });

  describe('dispute reply and evidence link', () => {
    it('posts a chat reply on a dispute and returns an evidence upload link', async () => {
      const { escrowId, buyer, seller } = await createEscrow(50_000);
      await shipAndDeliver(escrowId, seller, buyer);
      const phone = await linkWhatsApp(buyer);
      const escrow = await escrows.findOne({ where: { id: escrowId } });

      whatsappClient.clear();
      await sendWhatsAppMessage(phone, `DISPUTE ${escrow!.code} the item arrived damaged`);
      await waitFor(() => Promise.resolve(whatsappClient.sent.length >= 1));
      expect(whatsappClient.lastMessageTo(phone)?.body).toMatch(/reply sent/i);

      const messagesResponse = await request(server)
        .get(`/escrows/${escrowId}/chat`)
        .set(auth(buyer.accessToken));
      const bodies = (messagesResponse.body as { body: string }[]).map((message) => message.body);
      expect(bodies).toContain('the item arrived damaged');

      whatsappClient.clear();
      await sendWhatsAppMessage(phone, `EVIDENCE ${escrow!.code}`);
      await waitFor(() => Promise.resolve(whatsappClient.sent.length >= 1));
      expect(whatsappClient.lastMessageTo(phone)?.body).toContain(`/escrows/${escrowId}/evidence`);
    });
  });
});
