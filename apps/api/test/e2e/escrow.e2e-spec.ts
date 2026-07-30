import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { EscrowStateMachine } from '../../src/escrow/escrow-state-machine';
import { EscrowState } from '../../src/escrow/entities/escrow-state.enum';
import { EscrowRole } from '../../src/escrow/entities/escrow-role.enum';
import { Escrow } from '../../src/database/entities/escrow.entity';
import { EscrowEvent } from '../../src/database/entities/escrow-event.entity';
import { EscrowParty } from '../../src/database/entities/escrow-party.entity';
import { Invite } from '../../src/database/entities/invite.entity';
import { EvidenceItem } from '../../src/database/entities/evidence-item.entity';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { RedisService } from '../../src/redis/redis.service';

interface AuthTokensBody {
  accessToken: string;
  user: { id: string };
}

interface EscrowDetailBody {
  id: string;
  state: EscrowState;
  version: number;
  terms: {
    price: { amount: number; currency: string };
    inspectionWindowHours: number;
    deliveryMethod: string;
    itemDescription: string;
    feeBps: number;
    requiresVerification: boolean;
    agreementText: string | null;
  } | null;
  parties: { userId: string; role: EscrowRole; termsAcceptedAt: string | null }[];
}

interface InviteBody {
  token: string;
  expiresAt: string;
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface EscrowEventBody {
  id: string;
  fromState: EscrowState;
  toState: EscrowState;
  actorId: string | null;
  reason: string | null;
  createdAt: string;
}

interface InvitePreviewBody {
  escrowId: string;
  initiatorRole: EscrowRole;
  terms: { itemDescription: string };
  evidence: { id: string; url?: string }[];
  expiresAt: string;
}

describe('Escrow (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let stateMachine: EscrowStateMachine;
  let escrows: Repository<Escrow>;
  let escrowEvents: Repository<EscrowEvent>;
  let escrowParties: Repository<EscrowParty>;
  let invites: Repository<Invite>;
  let evidenceItems: Repository<EvidenceItem>;
  let redis: RedisService;
  let userCounter = 0;

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
    return `escrow-user-${Date.now()}-${userCounter}@example.com`;
  }

  async function registerAndLogin(): Promise<{ userId: string; accessToken: string }> {
    const email = uniqueEmail();
    await request(server).post('/auth/register').send({ email, password });
    const loginResponse = await request(server).post('/auth/login').send({ email, password });
    const body = loginResponse.body as AuthTokensBody;
    return { userId: body.user.id, accessToken: body.accessToken };
  }

  function auth(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  async function seedCreationEvidence(escrowId: string, uploaderId: string): Promise<void> {
    await evidenceItems.save(
      evidenceItems.create({
        escrowId,
        uploaderId,
        phase: EvidencePhase.AT_CREATION,
        storageKey: `evidence/${escrowId}/seed-${Date.now()}`,
        contentHash: 'seed-hash-not-a-real-sha256',
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

  async function createDraft(accessToken: string): Promise<EscrowDetailBody> {
    const response = await request(server)
      .post('/escrows')
      .set(auth(accessToken))
      .send({ role: EscrowRole.BUYER, ...validTerms });
    const draft = response.body as EscrowDetailBody;
    await seedCreationEvidence(draft.id, draft.parties[0].userId);
    return draft;
  }

  async function createAgreedEscrow(): Promise<{
    escrowId: string;
    buyer: { userId: string; accessToken: string };
    seller: { userId: string; accessToken: string };
  }> {
    const buyer = await registerAndLogin();
    const seller = await registerAndLogin();

    const draft = await createDraft(buyer.accessToken);
    const inviteResponse = await request(server)
      .post(`/escrows/${draft.id}/invite`)
      .set(auth(buyer.accessToken));
    const invite = inviteResponse.body as InviteBody;

    await request(server).post(`/invites/${invite.token}/accept`).set(auth(seller.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(buyer.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(seller.accessToken));

    return { escrowId: draft.id, buyer, seller };
  }

  async function eventCount(escrowId: string): Promise<number> {
    return escrowEvents.count({ where: { escrowId } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    stateMachine = app.get(EscrowStateMachine);
    escrows = app.get<Repository<Escrow>>(getRepositoryToken(Escrow));
    escrowEvents = app.get<Repository<EscrowEvent>>(getRepositoryToken(EscrowEvent));
    escrowParties = app.get<Repository<EscrowParty>>(getRepositoryToken(EscrowParty));
    invites = app.get<Repository<Invite>>(getRepositoryToken(Invite));
    evidenceItems = app.get<Repository<EvidenceItem>>(getRepositoryToken(EvidenceItem));
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  describe('draft creation, invite, and agreement', () => {
    it('creates a draft with the initiator as the only party', async () => {
      const buyer = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);

      expect(draft.state).toBe(EscrowState.DRAFT);
      expect(draft.parties).toHaveLength(1);
      expect(draft.parties[0]).toMatchObject({ userId: buyer.userId, role: EscrowRole.BUYER });
      expect(draft.terms?.price).toEqual(validTerms.price);
    });

    it('defaults requiresVerification to false and agreementText to null when omitted', async () => {
      const buyer = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);

      expect(draft.terms?.requiresVerification).toBe(false);
      expect(draft.terms?.agreementText).toBeNull();
    });

    it('accepts and returns requiresVerification and a written agreement', async () => {
      const buyer = await registerAndLogin();

      const response = await request(server)
        .post('/escrows')
        .set(auth(buyer.accessToken))
        .send({
          role: EscrowRole.BUYER,
          ...validTerms,
          requiresVerification: true,
          agreementText: 'Buyer pays return shipping if the item is not as described.',
        });

      expect(response.status).toBe(201);
      const draft = response.body as EscrowDetailBody;
      expect(draft.terms?.requiresVerification).toBe(true);
      expect(draft.terms?.agreementText).toBe(
        'Buyer pays return shipping if the item is not as described.',
      );
    });

    it('drives DRAFT -> PENDING_COUNTERPARTY -> AGREED and writes exactly one event per transition', async () => {
      const buyer = await registerAndLogin();
      const seller = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);

      const inviteResponse = await request(server)
        .post(`/escrows/${draft.id}/invite`)
        .set(auth(buyer.accessToken));
      expect(inviteResponse.status).toBe(201);
      expect(await eventCount(draft.id)).toBe(1);

      const invite = inviteResponse.body as InviteBody;
      const acceptResponse = await request(server)
        .post(`/invites/${invite.token}/accept`)
        .set(auth(seller.accessToken));
      expect(acceptResponse.status).toBe(200);
      const afterJoin = acceptResponse.body as EscrowDetailBody;
      expect(afterJoin.state).toBe(EscrowState.PENDING_COUNTERPARTY);
      expect(afterJoin.parties).toHaveLength(2);
      expect(afterJoin.parties.find((p) => p.userId === seller.userId)?.role).toBe(
        EscrowRole.SELLER,
      );

      const firstAccept = await request(server)
        .post(`/escrows/${draft.id}/accept-terms`)
        .set(auth(buyer.accessToken));
      expect((firstAccept.body as EscrowDetailBody).state).toBe(EscrowState.PENDING_COUNTERPARTY);
      expect(await eventCount(draft.id)).toBe(1);

      const secondAccept = await request(server)
        .post(`/escrows/${draft.id}/accept-terms`)
        .set(auth(seller.accessToken));
      expect((secondAccept.body as EscrowDetailBody).state).toBe(EscrowState.AGREED);
      expect(await eventCount(draft.id)).toBe(2);
    });

    it('rejects a third party invite acceptance on an already-used token', async () => {
      const { escrowId } = await createAgreedEscrow();
      const invite = await invites.findOne({ where: { escrowId } });
      const stranger = await registerAndLogin();

      const response = await request(server)
        .post(`/invites/${invite?.token}/accept`)
        .set(auth(stranger.accessToken));

      expect(response.status).toBe(410);
      expect((response.body as ErrorBody).code).toBe('INVITE_NO_LONGER_VALID');
    });

    it('rejects inviting again once already PENDING_COUNTERPARTY', async () => {
      const buyer = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);
      await request(server).post(`/escrows/${draft.id}/invite`).set(auth(buyer.accessToken));

      const secondInvite = await request(server)
        .post(`/escrows/${draft.id}/invite`)
        .set(auth(buyer.accessToken));

      expect(secondInvite.status).toBe(409);
      expect((secondInvite.body as ErrorBody).code).toBe('ILLEGAL_ESCROW_TRANSITION');
    });

    it('rejects an expired invite token and leaves the escrow PENDING_COUNTERPARTY', async () => {
      const buyer = await registerAndLogin();
      const seller = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);
      const inviteResponse = await request(server)
        .post(`/escrows/${draft.id}/invite`)
        .set(auth(buyer.accessToken));
      const invite = inviteResponse.body as InviteBody;

      await invites.update({ token: invite.token }, { expiresAt: new Date(Date.now() - 1000) });

      const acceptResponse = await request(server)
        .post(`/invites/${invite.token}/accept`)
        .set(auth(seller.accessToken));

      expect(acceptResponse.status).toBe(410);
      expect((acceptResponse.body as ErrorBody).code).toBe('INVITE_NO_LONGER_VALID');

      const escrow = await escrows.findOne({ where: { id: draft.id } });
      expect(escrow?.state).toBe(EscrowState.PENDING_COUNTERPARTY);
    });

    it('rejects an invite token for an escrow that moved on before it was used', async () => {
      const buyer = await registerAndLogin();
      const seller = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);
      const inviteResponse = await request(server)
        .post(`/escrows/${draft.id}/invite`)
        .set(auth(buyer.accessToken));
      const invite = inviteResponse.body as InviteBody;

      await request(server).post(`/escrows/${draft.id}/cancel`).set(auth(buyer.accessToken));

      const acceptResponse = await request(server)
        .post(`/invites/${invite.token}/accept`)
        .set(auth(seller.accessToken));

      expect(acceptResponse.status).toBe(410);
      const body = acceptResponse.body as ErrorBody;
      expect(body.details).toMatchObject({ reason: 'escrow_unavailable' });
    });

    it('enforces exactly one buyer and one seller at the database level', async () => {
      const { escrowId } = await createAgreedEscrow();
      const thirdParty = await registerAndLogin();

      await expect(
        escrowParties.insert({
          escrowId,
          userId: thirdParty.userId,
          role: EscrowRole.BUYER,
          termsAcceptedAt: null,
        }),
      ).rejects.toThrow();
    });
  });

  describe('listing a user’s escrows', () => {
    it('returns every escrow the caller is a party to, newest activity first', async () => {
      const buyer = await registerAndLogin();
      const first = await createDraft(buyer.accessToken);
      const second = await createDraft(buyer.accessToken);

      const response = await request(server).get('/escrows').set(auth(buyer.accessToken));

      expect(response.status).toBe(200);
      const list = response.body as EscrowDetailBody[];
      expect(list.map((escrow) => escrow.id)).toEqual([second.id, first.id]);
      expect(list[0].terms?.itemDescription).toBe(validTerms.itemDescription);
      expect(list[0].parties).toHaveLength(1);
    });

    it('includes an escrow the caller joined as the counterparty', async () => {
      const { escrowId, seller } = await createAgreedEscrow();

      const response = await request(server).get('/escrows').set(auth(seller.accessToken));

      const list = response.body as EscrowDetailBody[];
      expect(list.map((escrow) => escrow.id)).toContain(escrowId);
      expect(list.find((escrow) => escrow.id === escrowId)?.parties).toHaveLength(2);
    });

    it('never leaks an escrow the caller is not a party to', async () => {
      const { escrowId } = await createAgreedEscrow();
      const stranger = await registerAndLogin();

      const response = await request(server).get('/escrows').set(auth(stranger.accessToken));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
      expect((response.body as EscrowDetailBody[]).map((escrow) => escrow.id)).not.toContain(
        escrowId,
      );
    });

    it('requires authentication', async () => {
      const response = await request(server).get('/escrows');

      expect(response.status).toBe(401);
    });
  });

  describe('event timeline', () => {
    it('returns events in chronological order for a party', async () => {
      const { escrowId, buyer } = await createAgreedEscrow();

      const response = await request(server)
        .get(`/escrows/${escrowId}/events`)
        .set(auth(buyer.accessToken));

      expect(response.status).toBe(200);
      const events = response.body as EscrowEventBody[];
      expect(events.length).toBeGreaterThanOrEqual(2);
      const timestamps = events.map((event) => new Date(event.createdAt).getTime());
      expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
      expect(events[events.length - 1].toState).toBe(EscrowState.AGREED);
    });

    it('denies a non-party', async () => {
      const { escrowId } = await createAgreedEscrow();
      const stranger = await registerAndLogin();

      const response = await request(server)
        .get(`/escrows/${escrowId}/events`)
        .set(auth(stranger.accessToken));

      expect(response.status).toBe(403);
      expect((response.body as ErrorBody).code).toBe('NOT_ESCROW_PARTY');
    });
  });

  describe('invite preview', () => {
    it('shows terms and creation evidence for a valid token without requiring party membership', async () => {
      const buyer = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);
      const inviteResponse = await request(server)
        .post(`/escrows/${draft.id}/invite`)
        .set(auth(buyer.accessToken));
      const invite = inviteResponse.body as InviteBody;

      const preview = await request(server).get(`/invites/${invite.token}`);

      expect(preview.status).toBe(200);
      const body = preview.body as InvitePreviewBody;
      expect(body.escrowId).toBe(draft.id);
      expect(body.initiatorRole).toBe(EscrowRole.BUYER);
      expect(body.terms.itemDescription).toBe(validTerms.itemDescription);
      expect(body.evidence).toHaveLength(1);
      expect(body.evidence[0].url).toEqual(expect.any(String));
    });

    it('returns 404 for an unknown token', async () => {
      const response = await request(server).get('/invites/does-not-exist');
      expect(response.status).toBe(404);
      expect((response.body as ErrorBody).code).toBe('INVITE_NOT_FOUND');
    });

    it('returns 410 for an already-used token', async () => {
      const { escrowId } = await createAgreedEscrow();
      const invite = await invites.findOne({ where: { escrowId } });

      const response = await request(server).get(`/invites/${invite?.token}`);

      expect(response.status).toBe(410);
      expect((response.body as ErrorBody).code).toBe('INVITE_NO_LONGER_VALID');
    });
  });

  describe('terms freeze', () => {
    it('allows editing terms before AGREED', async () => {
      const buyer = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);

      const response = await request(server)
        .patch(`/escrows/${draft.id}/terms`)
        .set(auth(buyer.accessToken))
        .send({ ...validTerms, itemDescription: 'An updated description' });

      expect(response.status).toBe(200);
      expect((response.body as EscrowDetailBody['terms'])?.itemDescription).toBe(
        'An updated description',
      );
    });

    it('rejects editing terms once AGREED', async () => {
      const { escrowId, buyer } = await createAgreedEscrow();

      const response = await request(server)
        .patch(`/escrows/${escrowId}/terms`)
        .set(auth(buyer.accessToken))
        .send({ ...validTerms, itemDescription: 'Trying to sneak a change in' });

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).code).toBe('TERMS_FROZEN');
    });
  });

  describe('the full transition table', () => {
    it('drives the happy path AGREED -> FUNDED -> SHIPPED -> DELIVERED -> RELEASED', async () => {
      const { escrowId } = await createAgreedEscrow();

      for (const to of [
        EscrowState.FUNDED,
        EscrowState.SHIPPED,
        EscrowState.DELIVERED,
        EscrowState.RELEASED,
      ]) {
        const before = await eventCount(escrowId);
        const result = await stateMachine.transition(escrowId, to, {
          actorId: null,
          reason: `test drive to ${to}`,
        });
        expect(result.state).toBe(to);
        expect(await eventCount(escrowId)).toBe(before + 1);
      }
    });

    it('drives the dispute-release branch AGREED -> ... -> DISPUTED -> RESOLVED_RELEASE -> RELEASED', async () => {
      const { escrowId } = await createAgreedEscrow();
      const before = await eventCount(escrowId);
      await stateMachine.transition(escrowId, EscrowState.FUNDED, { actorId: null });
      await stateMachine.transition(escrowId, EscrowState.SHIPPED, { actorId: null });
      await stateMachine.transition(escrowId, EscrowState.DELIVERED, { actorId: null });
      await stateMachine.transition(escrowId, EscrowState.DISPUTED, { actorId: null });
      await stateMachine.transition(escrowId, EscrowState.RESOLVED_RELEASE, { actorId: null });
      const result = await stateMachine.transition(escrowId, EscrowState.RELEASED, {
        actorId: null,
      });

      expect(result.state).toBe(EscrowState.RELEASED);
      expect(await eventCount(escrowId)).toBe(before + 6);
    });

    it('drives the dispute-refund branch AGREED -> ... -> DISPUTED -> RESOLVED_REFUND -> REFUNDED', async () => {
      const { escrowId } = await createAgreedEscrow();
      await stateMachine.transition(escrowId, EscrowState.FUNDED, { actorId: null });
      await stateMachine.transition(escrowId, EscrowState.SHIPPED, { actorId: null });
      await stateMachine.transition(escrowId, EscrowState.DELIVERED, { actorId: null });
      await stateMachine.transition(escrowId, EscrowState.DISPUTED, { actorId: null });
      await stateMachine.transition(escrowId, EscrowState.RESOLVED_REFUND, { actorId: null });
      const result = await stateMachine.transition(escrowId, EscrowState.REFUNDED, {
        actorId: null,
      });

      expect(result.state).toBe(EscrowState.REFUNDED);
    });

    it('cancels from PENDING_COUNTERPARTY and from AGREED', async () => {
      const buyer = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);
      await request(server).post(`/escrows/${draft.id}/invite`).set(auth(buyer.accessToken));

      const cancelled = await request(server)
        .post(`/escrows/${draft.id}/cancel`)
        .set(auth(buyer.accessToken));
      expect((cancelled.body as EscrowDetailBody).state).toBe(EscrowState.CANCELLED);

      const { escrowId, buyer: agreedBuyer } = await createAgreedEscrow();
      const cancelledFromAgreed = await request(server)
        .post(`/escrows/${escrowId}/cancel`)
        .set(auth(agreedBuyer.accessToken));
      expect((cancelledFromAgreed.body as EscrowDetailBody).state).toBe(EscrowState.CANCELLED);
    });

    it('deletes an unsent draft, cancelling it and writing exactly one event', async () => {
      const buyer = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);
      const before = await eventCount(draft.id);

      const cancelled = await request(server)
        .post(`/escrows/${draft.id}/cancel`)
        .set(auth(buyer.accessToken));

      expect(cancelled.status).toBe(200);
      expect((cancelled.body as EscrowDetailBody).state).toBe(EscrowState.CANCELLED);
      expect(await eventCount(draft.id)).toBe(before + 1);
    });

    it('refuses to delete a draft belonging to somebody else', async () => {
      const buyer = await registerAndLogin();
      const stranger = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);

      const response = await request(server)
        .post(`/escrows/${draft.id}/cancel`)
        .set(auth(stranger.accessToken));

      expect(response.status).toBe(403);
      const still = await request(server).get(`/escrows/${draft.id}`).set(auth(buyer.accessToken));
      expect((still.body as EscrowDetailBody).state).toBe(EscrowState.DRAFT);
    });

    it('rejects the illegal transition DRAFT -> RELEASED and writes no event', async () => {
      const buyer = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);
      const before = await eventCount(draft.id);

      await expect(
        stateMachine.transition(draft.id, EscrowState.RELEASED, { actorId: buyer.userId }),
      ).rejects.toMatchObject({ code: 'ILLEGAL_ESCROW_TRANSITION' });
      expect(await eventCount(draft.id)).toBe(before);
    });

    it('rejects the illegal transition AGREED -> DISPUTED and writes no event', async () => {
      const { escrowId } = await createAgreedEscrow();
      const before = await eventCount(escrowId);

      await expect(
        stateMachine.transition(escrowId, EscrowState.DISPUTED, { actorId: null }),
      ).rejects.toMatchObject({ code: 'ILLEGAL_ESCROW_TRANSITION' });
      expect(await eventCount(escrowId)).toBe(before);
    });

    it('rejects CANCELLED -> FUNDED', async () => {
      const buyer = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);
      await request(server).post(`/escrows/${draft.id}/cancel`).set(auth(buyer.accessToken));

      await expect(
        stateMachine.transition(draft.id, EscrowState.FUNDED, { actorId: null }),
      ).rejects.toMatchObject({ code: 'ILLEGAL_ESCROW_TRANSITION' });
    });

    it('hard-errors on a duplicate transition out of a terminal state, but transitionIdempotent no-ops', async () => {
      const { escrowId } = await createAgreedEscrow();
      await stateMachine.transition(escrowId, EscrowState.FUNDED, { actorId: null });
      await stateMachine.transition(escrowId, EscrowState.SHIPPED, { actorId: null });
      await stateMachine.transition(escrowId, EscrowState.DELIVERED, { actorId: null });
      await stateMachine.transition(escrowId, EscrowState.RELEASED, { actorId: null });
      const eventsAfterRelease = await eventCount(escrowId);

      await expect(
        stateMachine.transition(escrowId, EscrowState.RELEASED, { actorId: null }),
      ).rejects.toMatchObject({ code: 'ILLEGAL_ESCROW_TRANSITION' });
      expect(await eventCount(escrowId)).toBe(eventsAfterRelease);

      const result = await stateMachine.transitionIdempotent(escrowId, EscrowState.RELEASED, {
        actorId: null,
      });
      expect(result.state).toBe(EscrowState.RELEASED);
      expect(await eventCount(escrowId)).toBe(eventsAfterRelease);
    });

    it('a repeated HTTP cancel on an already-cancelled escrow is idempotent', async () => {
      const buyer = await registerAndLogin();
      const draft = await createDraft(buyer.accessToken);
      await request(server).post(`/escrows/${draft.id}/invite`).set(auth(buyer.accessToken));

      const first = await request(server)
        .post(`/escrows/${draft.id}/cancel`)
        .set(auth(buyer.accessToken));
      const second = await request(server)
        .post(`/escrows/${draft.id}/cancel`)
        .set(auth(buyer.accessToken));

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect((second.body as EscrowDetailBody).state).toBe(EscrowState.CANCELLED);
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of two simultaneous transitions win; the loser sees a stale-version error', async () => {
      const { escrowId, buyer } = await createAgreedEscrow();
      const before = await eventCount(escrowId);

      const results = await Promise.allSettled([
        stateMachine.transition(escrowId, EscrowState.FUNDED, { actorId: null }),
        stateMachine.transition(escrowId, EscrowState.CANCELLED, { actorId: buyer.userId }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({
        code: 'STALE_ESCROW_VERSION',
      });

      const finalEscrow = await escrows.findOne({ where: { id: escrowId } });
      const winningState = fulfilled[0].value.state;
      expect(finalEscrow?.state).toBe(winningState);
      expect(await eventCount(escrowId)).toBe(before + 1);
    });
  });
});
