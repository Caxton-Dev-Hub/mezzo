import type { Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../../src/app.module';
import { EscrowRole } from '../../src/escrow/entities/escrow-role.enum';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { User } from '../../src/database/entities/user.entity';
import { UserRole } from '../../src/users/entities/user-role.enum';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { RedisService } from '../../src/redis/redis.service';

const PAYSTACK_SECRET = 'test-paystack-secret-key';

interface AuthTokensBody {
  accessToken: string;
  user: { id: string };
}

interface EscrowDetailBody {
  id: string;
}

interface PresignBody {
  uploadUrl: string;
  key: string;
}

interface EvidenceItemBody {
  id: string;
  contentHash: string;
}

interface ChatMessageBody {
  id: string;
  escrowId: string;
  senderId: string;
  body: string;
  attachment: EvidenceItemBody | null;
  createdAt: string;
}

interface ChatReadStateBody {
  userId: string;
  lastReadAt: string;
}

interface EscrowUpdatedBody {
  escrowId: string;
  eventType: string;
  occurredAt: string;
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

interface InviteBody {
  token: string;
}

interface PaymentIntentBody {
  reference: string;
}

const fixturesDir = join(__dirname, '..', 'fixtures', 'evidence');

describe('Chat (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let baseUrl: string;
  let redis: RedisService;
  let users: Repository<User>;
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
    return `chat-user-${Date.now()}-${userCounter}@example.com`;
  }

  function uniqueEventId(): string {
    eventCounter += 1;
    return `evt-chat-${Date.now()}-${eventCounter}`;
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

  async function createAgreedEscrow(): Promise<{
    escrowId: string;
    buyer: { userId: string; accessToken: string };
    seller: { userId: string; accessToken: string };
  }> {
    const buyer = await registerAndLogin();
    const seller = await registerAndLogin();

    const draftResponse = await request(server)
      .post('/escrows')
      .set(auth(buyer.accessToken))
      .send({
        ...defaultTerms,
        price: { amount: 100_000, currency: 'NGN' },
        role: EscrowRole.BUYER,
      });
    const draft = draftResponse.body as EscrowDetailBody;

    await uploadEvidence(buyer.accessToken, draft.id, EvidencePhase.AT_CREATION, 'with-exif.jpg', 'image/jpeg');

    const inviteResponse = await request(server)
      .post(`/escrows/${draft.id}/invite`)
      .set(auth(buyer.accessToken));
    const invite = inviteResponse.body as InviteBody;

    await request(server).post(`/invites/${invite.token}/accept`).set(auth(seller.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(buyer.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(seller.accessToken));

    return { escrowId: draft.id, buyer, seller };
  }

  async function createDisputedEscrow(): Promise<{
    escrowId: string;
    buyer: { userId: string; accessToken: string };
    seller: { userId: string; accessToken: string };
  }> {
    const { escrowId, buyer, seller } = await createAgreedEscrow();
    await users.update({ id: buyer.userId }, { kycTier: KycTier.TIER_1 });

    const fundResponse = await request(server)
      .post(`/payments/escrows/${escrowId}/fund`)
      .set(auth(buyer.accessToken));
    const intent = fundResponse.body as PaymentIntentBody;
    const webhookStatus = await postSignedWebhook(chargeSuccessPayload(intent.reference, 100_000));
    expect(webhookStatus).toBe(200);

    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server).post(`/escrows/${escrowId}/confirm-delivery`).set(auth(buyer.accessToken));

    await uploadEvidence(buyer.accessToken, escrowId, EvidencePhase.AT_DELIVERY, 'with-exif.jpg', 'image/jpeg');
    const disputeResponse = await request(server)
      .post(`/escrows/${escrowId}/disputes`)
      .set(auth(buyer.accessToken))
      .send({ reasonCode: 'NOT_AS_DESCRIBED', statement: 'The item does not match the listing.' });
    expect(disputeResponse.status).toBe(201);

    return { escrowId, buyer, seller };
  }

  function readFixture(name: string): Buffer {
    return readFileSync(join(fixturesDir, name));
  }

  async function uploadEvidence(
    accessToken: string,
    escrowId: string,
    phase: EvidencePhase,
    fixtureName: string,
    mimeType: string,
  ): Promise<EvidenceItemBody> {
    const presignResponse = await request(server)
      .post('/evidence/presign')
      .set(auth(accessToken))
      .send({ escrowId, phase, mimeType });
    const presign = presignResponse.body as PresignBody;

    await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: readFixture(fixtureName),
    });

    const confirmResponse = await request(server)
      .post('/evidence/confirm')
      .set(auth(accessToken))
      .send({ escrowId, phase, key: presign.key, declaredMime: mimeType });

    return confirmResponse.body as EvidenceItemBody;
  }

  function connectSocket(auth_: Record<string, unknown>): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/ws/chat`, {
        auth: auth_,
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      const timeout = setTimeout(() => reject(new Error('connect timeout')), 4000);
      socket.on('connect', () => {
        clearTimeout(timeout);
        resolve(socket);
      });
      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 4000);
      socket.once(event, (payload: T) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    await app.listen(0);
    server = app.getHttpServer() as Server;
    baseUrl = await app.getUrl();
    redis = app.get(RedisService);
    users = app.get<Repository<User>>(getRepositoryToken(User));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('rejects a non-party from reading or posting to the chat', async () => {
    const { escrowId } = await createAgreedEscrow();
    const stranger = await registerAndLogin();

    const listResponse = await request(server)
      .get(`/escrows/${escrowId}/chat`)
      .set(auth(stranger.accessToken));
    expect(listResponse.status).toBe(403);

    const sendResponse = await request(server)
      .post(`/escrows/${escrowId}/chat`)
      .set(auth(stranger.accessToken))
      .send({ body: 'hello' });
    expect(sendResponse.status).toBe(403);
  });

  it('allows both parties to exchange messages', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow();

    const sendResponse = await request(server)
      .post(`/escrows/${escrowId}/chat`)
      .set(auth(buyer.accessToken))
      .send({ body: 'Is this still available?' });
    expect(sendResponse.status).toBe(201);
    const message = sendResponse.body as ChatMessageBody;
    expect(message.senderId).toBe(buyer.userId);

    const listResponse = await request(server)
      .get(`/escrows/${escrowId}/chat`)
      .set(auth(seller.accessToken));
    expect(listResponse.status).toBe(200);
    const messages = listResponse.body as ChatMessageBody[];
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe('Is this still available?');
  });

  it('denies the arbiter access before a dispute exists and grants it once DISPUTED', async () => {
    const { escrowId, buyer } = await createAgreedEscrow();
    const arbiter = await registerAndLogin(UserRole.ARBITER);

    await request(server).post(`/escrows/${escrowId}/chat`).set(auth(buyer.accessToken)).send({ body: 'hi' });

    const beforeDispute = await request(server)
      .get(`/escrows/${escrowId}/chat`)
      .set(auth(arbiter.accessToken));
    expect(beforeDispute.status).toBe(403);
  });

  it('grants the arbiter access after a dispute is raised', async () => {
    const { escrowId, buyer } = await createDisputedEscrow();
    const arbiter = await registerAndLogin(UserRole.ARBITER);

    void buyer;
    const afterDispute = await request(server)
      .get(`/escrows/${escrowId}/chat`)
      .set(auth(arbiter.accessToken));
    expect(afterDispute.status).toBe(200);
  });

  it('exposes no edit or delete endpoint for chat messages', async () => {
    const { escrowId, buyer } = await createAgreedEscrow();
    const sendResponse = await request(server)
      .post(`/escrows/${escrowId}/chat`)
      .set(auth(buyer.accessToken))
      .send({ body: 'immutable message' });
    const message = sendResponse.body as ChatMessageBody;

    const patchResponse = await request(server)
      .patch(`/escrows/${escrowId}/chat/${message.id}`)
      .set(auth(buyer.accessToken))
      .send({ body: 'edited' });
    const deleteResponse = await request(server)
      .delete(`/escrows/${escrowId}/chat/${message.id}`)
      .set(auth(buyer.accessToken));

    expect(patchResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
  });

  it('rejects an empty message with no attachment', async () => {
    const { escrowId, buyer } = await createAgreedEscrow();
    const response = await request(server)
      .post(`/escrows/${escrowId}/chat`)
      .set(auth(buyer.accessToken))
      .send({ body: '' });
    expect(response.status).toBe(400);
  });

  it('routes chat attachments through the evidence module so they are hashed and appear in the bundle', async () => {
    const { escrowId, buyer } = await createAgreedEscrow();

    const uploaded = await uploadEvidence(
      buyer.accessToken,
      escrowId,
      EvidencePhase.CHAT,
      'with-exif.jpg',
      'image/jpeg',
    );
    expect(uploaded.contentHash).toHaveLength(64);

    const sendResponse = await request(server)
      .post(`/escrows/${escrowId}/chat`)
      .set(auth(buyer.accessToken))
      .send({ body: 'see attached', attachmentEvidenceItemId: uploaded.id });
    expect(sendResponse.status).toBe(201);
    const message = sendResponse.body as ChatMessageBody;
    expect(message.attachment).not.toBeNull();
    expect(message.attachment?.contentHash).toBe(uploaded.contentHash);

    const bundleResponse = await request(server)
      .get(`/evidence/${escrowId}`)
      .set(auth(buyer.accessToken));
    const bundleItemIds = (bundleResponse.body as { items: EvidenceItemBody[] }).items.map((item) => item.id);
    expect(bundleItemIds).toContain(uploaded.id);
  });

  it('rejects an attachment referencing an evidence item from another escrow', async () => {
    const first = await createAgreedEscrow();
    const second = await createAgreedEscrow();
    const uploaded = await uploadEvidence(
      first.buyer.accessToken,
      first.escrowId,
      EvidencePhase.CHAT,
      'with-exif.jpg',
      'image/jpeg',
    );

    const response = await request(server)
      .post(`/escrows/${second.escrowId}/chat`)
      .set(auth(second.buyer.accessToken))
      .send({ body: 'cross-escrow attempt', attachmentEvidenceItemId: uploaded.id });

    expect(response.status).toBe(404);
    expect((response.body as ErrorBody).code).toBe('EVIDENCE_ATTACHMENT_NOT_FOUND');
  });

  it('rejects a websocket connection with no token', async () => {
    const { escrowId } = await createAgreedEscrow();

    await expect(connectSocket({ escrowId })).rejects.toMatchObject({
      data: { code: 'UNAUTHORIZED' },
    });
  });

  it('rejects a websocket subscription from a user who is not a party to the escrow', async () => {
    const { escrowId } = await createAgreedEscrow();
    const stranger = await registerAndLogin();

    await expect(connectSocket({ token: stranger.accessToken, escrowId })).rejects.toMatchObject({
      data: { code: 'FORBIDDEN' },
    });
  });

  it('tells a party with an expired token to re-authenticate instead of denying access', async () => {
    const { escrowId, buyer } = await createAgreedEscrow();
    const jwtService = app.get(JwtService);
    const configService = app.get(ConfigService);
    const expiredToken = await jwtService.signAsync(
      { sub: buyer.userId, role: UserRole.USER },
      { secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: '-1s' },
    );

    await expect(connectSocket({ token: expiredToken, escrowId })).rejects.toMatchObject({
      data: { code: 'UNAUTHORIZED' },
    });
  });

  it('never dispatches an event before the handshake has authenticated the socket', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow();
    const sellerSocket = await connectSocket({ token: seller.accessToken, escrowId });

    const buyerSocket = io(`${baseUrl}/ws/chat`, {
      auth: { token: buyer.accessToken, escrowId },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    buyerSocket.emit('message:read');
    buyerSocket.emit('message:send', { body: 'sent the instant the socket opened' });

    try {
      const delivered = await waitForEvent<ChatMessageBody>(sellerSocket, 'message:new');
      expect(delivered.body).toBe('sent the instant the socket opened');
      expect(buyerSocket.connected).toBe(true);
    } finally {
      buyerSocket.close();
      sellerSocket.close();
    }
  });

  it('accepts an authenticated party and broadcasts messages to the room in realtime', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow();

    const buyerSocket = await connectSocket({ token: buyer.accessToken, escrowId });
    const sellerSocket = await connectSocket({ token: seller.accessToken, escrowId });

    try {
      const received = waitForEvent<ChatMessageBody>(sellerSocket, 'message:new');
      buyerSocket.emit('message:send', { body: 'hello over websocket' });
      const message = await received;
      expect(message.body).toBe('hello over websocket');
      expect(message.senderId).toBe(buyer.userId);
    } finally {
      buyerSocket.close();
      sellerSocket.close();
    }
  });

  it('records read state via REST and broadcasts message:read over the socket', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow();
    await request(server).post(`/escrows/${escrowId}/chat`).set(auth(buyer.accessToken)).send({ body: 'hi' });

    const buyerSocket = await connectSocket({ token: buyer.accessToken, escrowId });
    const sellerSocket = await connectSocket({ token: seller.accessToken, escrowId });

    try {
      const received = waitForEvent<ChatReadStateBody>(sellerSocket, 'message:read');
      buyerSocket.emit('message:read');
      const readState = await received;
      expect(readState.userId).toBe(buyer.userId);

      const restRead = await request(server)
        .post(`/escrows/${escrowId}/chat/read`)
        .set(auth(seller.accessToken));
      expect(restRead.status).toBe(200);
      expect((restRead.body as ChatReadStateBody).userId).toBe(seller.userId);

      const readStateResponse = await request(server)
        .get(`/escrows/${escrowId}/chat/read`)
        .set(auth(buyer.accessToken));
      const states = readStateResponse.body as ChatReadStateBody[];
      expect(states.map((s) => s.userId).sort()).toEqual([buyer.userId, seller.userId].sort());
    } finally {
      buyerSocket.close();
      sellerSocket.close();
    }
  });

  it('broadcasts escrow:updated into the chat room on a state transition', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow();
    await users.update({ id: buyer.userId }, { kycTier: KycTier.TIER_1 });

    const buyerSocket = await connectSocket({ token: buyer.accessToken, escrowId });

    try {
      const received = waitForEvent<EscrowUpdatedBody>(buyerSocket, 'escrow:updated');
      const fundResponse = await request(server)
        .post(`/payments/escrows/${escrowId}/fund`)
        .set(auth(buyer.accessToken));
      const intent = fundResponse.body as PaymentIntentBody;
      await postSignedWebhook(chargeSuccessPayload(intent.reference, 100_000));

      const event = await received;
      expect(event.escrowId).toBe(escrowId);
      void seller;
    } finally {
      buyerSocket.close();
    }
  });
});
