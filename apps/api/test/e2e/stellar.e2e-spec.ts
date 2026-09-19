import type { Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { EscrowState } from '../../src/escrow/entities/escrow-state.enum';
import { EscrowRole } from '../../src/escrow/entities/escrow-role.enum';
import { SettlementService } from '../../src/escrow/settlement.service';
import { User } from '../../src/database/entities/user.entity';
import { AuditEvent } from '../../src/database/entities/audit-event.entity';
import { StellarEscrow } from '../../src/database/entities/stellar-escrow.entity';
import { EvidenceItem } from '../../src/database/entities/evidence-item.entity';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { UserRole } from '../../src/users/entities/user-role.enum';
import { LedgerService } from '../../src/ledger/ledger.service';
import { ReconciliationService } from '../../src/ledger/reconciliation.service';
import { EntryDirection } from '../../src/ledger/entities/entry-direction.enum';
import { Money } from '../../src/common/money/money';
import { EscrowStateMachine } from '../../src/escrow/escrow-state-machine';
import {
  escrowHoldingRef,
  platformFeeRevenueRef,
  providerClearingRef,
  userWalletRef,
} from '../../src/ledger/account-refs';
import { StellarEscrowStatus } from '../../src/stellar/entities/stellar-escrow-status.enum';
import { STELLAR_LEDGER_PROVIDER } from '../../src/stellar/stellar-ledger-provider.constant';
import { encodeStellarAccountId } from '../../src/stellar/stellar-account-id';
import { FakeStellarProvider } from '../../src/stellar/providers/fake-stellar.provider';
import {
  StellarPaymentRequest,
  StellarPreparedPayment,
} from '../../src/stellar/providers/stellar-network.interface';
import { RedisService } from '../../src/redis/redis.service';

interface AuthTokensBody {
  accessToken: string;
  user: { id: string };
}

interface EscrowDetailBody {
  id: string;
  state: EscrowState;
  parties: { userId: string; role: EscrowRole }[];
}

interface StellarEscrowBody {
  escrowId: string;
  status: StellarEscrowStatus;
  network: string;
  depositAccountId: string;
  memo: string;
  asset: { code: string; issuer: string };
  expected: { amount: number; currency: string };
  expectedAssetAmount: string;
  fundingTransactionHash: string | null;
  settlementTransactionHash: string | null;
}

interface StellarSettlementOutcomeBody {
  escrowId: string;
  settled: boolean;
  transactionHash: string | null;
  blockedBy: string | null;
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

function sep53Payload(message: string): Buffer {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from('Stellar Signed Message:\n', 'utf8'), Buffer.from(message, 'utf8')]))
    .digest();
}

function randomAccountId(): string {
  return encodeStellarAccountId(
    Uint8Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)),
  );
}

describe('Stellar rail (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let users: Repository<User>;
  let auditEvents: Repository<AuditEvent>;
  let stellarEscrows: Repository<StellarEscrow>;
  let evidenceItems: Repository<EvidenceItem>;
  let ledger: LedgerService;
  let settlement: SettlementService;
  let reconciliation: ReconciliationService;
  let stateMachine: EscrowStateMachine;
  let network: FakeStellarProvider;
  let redis: RedisService;
  let userCounter = 0;

  const password = 'super-secret-password';
  const usdTerms = {
    price: { amount: 100_000, currency: 'USD' as const },
    inspectionWindowHours: 48,
    deliveryMethod: 'courier',
    itemDescription: 'A vintage camera',
    feeBps: 250,
  };

  function uniqueEmail(): string {
    userCounter += 1;
    return `stellar-user-${Date.now()}-${userCounter}@example.com`;
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

  async function createAgreedEscrow(
    price: { amount: number; currency: 'USD' | 'NGN' } = usdTerms.price,
  ): Promise<{
    escrowId: string;
    buyer: { userId: string; accessToken: string };
    seller: { userId: string; accessToken: string };
  }> {
    const buyer = await registerAndLogin();
    const seller = await registerAndLogin();
    await users.update({ id: buyer.userId }, { kycTier: KycTier.TIER_1 });

    const draftResponse = await request(server)
      .post('/escrows')
      .set(auth(buyer.accessToken))
      .send({ ...usdTerms, price, role: EscrowRole.BUYER });
    const draft = draftResponse.body as EscrowDetailBody;
    await seedCreationEvidence(draft.id, draft.parties[0].userId);

    const inviteResponse = await request(server)
      .post(`/escrows/${draft.id}/invite`)
      .set(auth(buyer.accessToken));
    const invite = inviteResponse.body as { token: string };

    await request(server).post(`/invites/${invite.token}/accept`).set(auth(seller.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(buyer.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(seller.accessToken));

    return { escrowId: draft.id, buyer, seller };
  }

  async function requestChallenge(accessToken: string, accountId: string): Promise<string> {
    const response = await request(server)
      .post('/stellar/wallet/challenge')
      .set(auth(accessToken))
      .send({ accountId });
    return (response.body as { message: string }).message;
  }

  function sign(keypair: Keypair, message: string): string {
    return keypair.sign(sep53Payload(message)).toString('base64');
  }

  async function linkWallet(accessToken: string, keypair = Keypair.random()): Promise<string> {
    const accountId = keypair.publicKey();
    const message = await requestChallenge(accessToken, accountId);

    await request(server)
      .post('/stellar/wallet')
      .set(auth(accessToken))
      .send({ accountId, signature: sign(keypair, message) });

    return accountId;
  }

  async function registerAdmin(): Promise<{ userId: string; accessToken: string }> {
    const admin = await registerAndLogin();
    await users.update({ id: admin.userId }, { role: UserRole.ADMIN });
    const email = (await users.findOneOrFail({ where: { id: admin.userId } })).email;
    const loginResponse = await request(server).post('/auth/login').send({ email, password });
    return {
      userId: admin.userId,
      accessToken: (loginResponse.body as AuthTokensBody).accessToken,
    };
  }

  async function auditTrail(escrowId: string): Promise<AuditEvent[]> {
    return auditEvents.find({
      where: { entityType: 'stellar_escrow', entityId: escrowId },
      order: { createdAt: 'ASC' },
    });
  }

  async function fundEscrow(
    escrowId: string,
    accessToken: string,
  ): Promise<{ opened: StellarEscrowBody; transactionHash: string }> {
    const opened = await openFunding(escrowId, accessToken);
    const payment = await network.receivePayment({
      from: randomAccountId(),
      to: opened.depositAccountId,
      amount: opened.expectedAssetAmount,
      memo: opened.memo,
    });
    await request(server)
      .post(`/stellar/escrows/${escrowId}/confirm`)
      .set(auth(accessToken))
      .send({ transactionHash: payment.transactionHash });
    return { opened, transactionHash: payment.transactionHash };
  }

  async function openFunding(escrowId: string, accessToken: string): Promise<StellarEscrowBody> {
    const response = await request(server)
      .post(`/stellar/escrows/${escrowId}/fund`)
      .set(auth(accessToken));
    return response.body as StellarEscrowBody;
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
    users = app.get<Repository<User>>(getRepositoryToken(User));
    auditEvents = app.get<Repository<AuditEvent>>(getRepositoryToken(AuditEvent));
    stellarEscrows = app.get<Repository<StellarEscrow>>(getRepositoryToken(StellarEscrow));
    evidenceItems = app.get<Repository<EvidenceItem>>(getRepositoryToken(EvidenceItem));
    ledger = app.get(LedgerService);
    settlement = app.get(SettlementService);
    reconciliation = app.get(ReconciliationService);
    stateMachine = app.get(EscrowStateMachine);
    network = app.get(FakeStellarProvider);
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('advertises the rail on a public config endpoint', async () => {
    const response = await request(server).get('/stellar/config');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      enabled: true,
      simulated: true,
      network: 'testnet',
      asset: { code: 'USDC', issuer: expect.stringMatching(/^G[A-Z2-7]{55}$/) as string },
    });
  });

  it('links, reads back, and unlinks a Stellar wallet', async () => {
    const user = await registerAndLogin();
    const keypair = Keypair.random();
    const accountId = keypair.publicKey();
    const message = await requestChallenge(user.accessToken, accountId);

    const linkResponse = await request(server)
      .post('/stellar/wallet')
      .set(auth(user.accessToken))
      .send({ accountId, signature: sign(keypair, message) });
    expect(linkResponse.status).toBe(200);
    expect((linkResponse.body as { accountId: string }).accountId).toBe(accountId);

    const readResponse = await request(server).get('/stellar/wallet').set(auth(user.accessToken));
    expect((readResponse.body as { accountId: string }).accountId).toBe(accountId);

    expect(
      (await request(server).delete('/stellar/wallet').set(auth(user.accessToken))).status,
    ).toBe(204);
    expect((await request(server).get('/stellar/wallet').set(auth(user.accessToken))).body).toEqual(
      {},
    );
  });

  it('rejects an account id that fails the StrKey checksum', async () => {
    const user = await registerAndLogin();
    const keypair = Keypair.random();

    const response = await request(server)
      .post('/stellar/wallet')
      .set(auth(user.accessToken))
      .send({ accountId: `G${'A'.repeat(55)}`, signature: sign(keypair, 'anything') });

    expect(response.status).toBe(400);
  });

  it('refuses to link an account nobody proved they own', async () => {
    const user = await registerAndLogin();
    const keypair = Keypair.random();
    const message = await requestChallenge(user.accessToken, keypair.publicKey());

    const response = await request(server)
      .post('/stellar/wallet')
      .set(auth(user.accessToken))
      .send({ accountId: keypair.publicKey(), signature: sign(Keypair.random(), message) });

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).code).toBe('STELLAR_SIGNATURE_INVALID');
    expect((await request(server).get('/stellar/wallet').set(auth(user.accessToken))).body).toEqual(
      {},
    );
  });

  it('refuses a link that was never challenged, and refuses a replay of a spent one', async () => {
    const user = await registerAndLogin();
    const keypair = Keypair.random();
    const accountId = keypair.publicKey();

    const unchallenged = await request(server)
      .post('/stellar/wallet')
      .set(auth(user.accessToken))
      .send({ accountId, signature: sign(keypair, 'never issued') });
    expect(unchallenged.status).toBe(400);
    expect((unchallenged.body as ErrorBody).code).toBe('STELLAR_LINK_CHALLENGE_NOT_FOUND');

    const message = await requestChallenge(user.accessToken, accountId);
    const signature = sign(keypair, message);

    expect(
      (
        await request(server)
          .post('/stellar/wallet')
          .set(auth(user.accessToken))
          .send({ accountId, signature })
      ).status,
    ).toBe(200);

    const replay = await request(server)
      .post('/stellar/wallet')
      .set(auth(user.accessToken))
      .send({ accountId, signature });
    expect(replay.status).toBe(400);
    expect((replay.body as ErrorBody).code).toBe('STELLAR_LINK_CHALLENGE_NOT_FOUND');
  });

  it('scopes a challenge to the session that asked for it', async () => {
    const owner = await registerAndLogin();
    const attacker = await registerAndLogin();
    const keypair = Keypair.random();
    const message = await requestChallenge(owner.accessToken, keypair.publicKey());

    const response = await request(server)
      .post('/stellar/wallet')
      .set(auth(attacker.accessToken))
      .send({ accountId: keypair.publicKey(), signature: sign(keypair, message) });

    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).code).toBe('STELLAR_LINK_CHALLENGE_NOT_FOUND');
  });

  it('funds an escrow end to end: deposit address, verified payment, FUNDED, ledger', async () => {
    const { escrowId, buyer } = await createAgreedEscrow();

    const opened = await openFunding(escrowId, buyer.accessToken);
    expect(opened.status).toBe(StellarEscrowStatus.AWAITING_DEPOSIT);
    expect(opened.expected).toEqual({ amount: 100_000, currency: 'USD' });
    expect(opened.expectedAssetAmount).toBe('1000.0000000');
    expect(opened.memo).toBe(escrowId.replace(/-/g, '').slice(0, 28));

    const payment = await network.receivePayment({
      from: randomAccountId(),
      to: opened.depositAccountId,
      amount: opened.expectedAssetAmount,
      memo: opened.memo,
    });

    const confirmResponse = await request(server)
      .post(`/stellar/escrows/${escrowId}/confirm`)
      .set(auth(buyer.accessToken))
      .send({ transactionHash: payment.transactionHash });

    expect(confirmResponse.status).toBe(200);
    const confirmed = confirmResponse.body as StellarEscrowBody;
    expect(confirmed.status).toBe(StellarEscrowStatus.FUNDED);
    expect(confirmed.fundingTransactionHash).toBe(payment.transactionHash);

    expect((await getEscrow(escrowId, buyer.accessToken)).state).toBe(EscrowState.FUNDED);

    expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({
      amount: 100_000,
      currency: 'USD',
    });
    expect(await ledger.getBalance(providerClearingRef(STELLAR_LEDGER_PROVIDER, 'USD'))).toEqual({
      amount: 100_000,
      currency: 'USD',
    });
  });

  it('confirming the same deposit twice funds the escrow exactly once', async () => {
    const { escrowId, buyer } = await createAgreedEscrow();
    const opened = await openFunding(escrowId, buyer.accessToken);
    const payment = await network.receivePayment({
      from: randomAccountId(),
      to: opened.depositAccountId,
      amount: opened.expectedAssetAmount,
      memo: opened.memo,
    });

    const first = await request(server)
      .post(`/stellar/escrows/${escrowId}/confirm`)
      .set(auth(buyer.accessToken))
      .send({ transactionHash: payment.transactionHash });
    const second = await request(server)
      .post(`/stellar/escrows/${escrowId}/confirm`)
      .set(auth(buyer.accessToken))
      .send({ transactionHash: payment.transactionHash });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({
      amount: 100_000,
      currency: 'USD',
    });
  });

  it('refuses a payment that went to the right account with the wrong memo', async () => {
    const { escrowId, buyer } = await createAgreedEscrow();
    const opened = await openFunding(escrowId, buyer.accessToken);
    const payment = await network.receivePayment({
      from: randomAccountId(),
      to: opened.depositAccountId,
      amount: opened.expectedAssetAmount,
      memo: 'someoneelsesescrow',
    });

    const response = await request(server)
      .post(`/stellar/escrows/${escrowId}/confirm`)
      .set(auth(buyer.accessToken))
      .send({ transactionHash: payment.transactionHash });

    expect(response.status).toBe(422);
    expect((response.body as ErrorBody).code).toBe('STELLAR_DEPOSIT_MISMATCH');
    expect((await getEscrow(escrowId, buyer.accessToken)).state).toBe(EscrowState.AGREED);
  });

  it('refuses a payment for the wrong amount', async () => {
    const { escrowId, buyer } = await createAgreedEscrow();
    const opened = await openFunding(escrowId, buyer.accessToken);
    const payment = await network.receivePayment({
      from: randomAccountId(),
      to: opened.depositAccountId,
      amount: '1.0000000',
      memo: opened.memo,
    });

    const response = await request(server)
      .post(`/stellar/escrows/${escrowId}/confirm`)
      .set(auth(buyer.accessToken))
      .send({ transactionHash: payment.transactionHash });

    expect(response.status).toBe(422);
    expect((await getEscrow(escrowId, buyer.accessToken)).state).toBe(EscrowState.AGREED);
  });

  it('refuses a transaction hash the network never saw', async () => {
    const { escrowId, buyer } = await createAgreedEscrow();
    await openFunding(escrowId, buyer.accessToken);

    const response = await request(server)
      .post(`/stellar/escrows/${escrowId}/confirm`)
      .set(auth(buyer.accessToken))
      .send({ transactionHash: 'a'.repeat(64) });

    expect(response.status).toBe(404);
    expect((response.body as ErrorBody).code).toBe('STELLAR_DEPOSIT_NOT_FOUND');
  });

  it('refuses to open a Stellar deposit on a naira-priced escrow', async () => {
    const { escrowId, buyer } = await createAgreedEscrow({ amount: 100_000, currency: 'NGN' });

    const response = await request(server)
      .post(`/stellar/escrows/${escrowId}/fund`)
      .set(auth(buyer.accessToken));

    expect(response.status).toBe(422);
    expect((response.body as ErrorBody).code).toBe('UNSUPPORTED_STELLAR_CURRENCY');
  });

  it('lets only the buyer open the deposit, and only parties read it', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow();
    const stranger = await registerAndLogin();

    expect(
      (
        await request(server)
          .post(`/stellar/escrows/${escrowId}/fund`)
          .set(auth(seller.accessToken))
      ).status,
    ).toBe(403);

    await openFunding(escrowId, buyer.accessToken);

    expect(
      (await request(server).get(`/stellar/escrows/${escrowId}`).set(auth(seller.accessToken)))
        .status,
    ).toBe(200);
    expect(
      (await request(server).get(`/stellar/escrows/${escrowId}`).set(auth(stranger.accessToken)))
        .status,
    ).toBe(403);
  });

  it('pays the seller out on-chain, net of the fee, once the escrow is released', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow();
    const sellerAccountId = await linkWallet(seller.accessToken);

    const opened = await openFunding(escrowId, buyer.accessToken);
    const payment = await network.receivePayment({
      from: randomAccountId(),
      to: opened.depositAccountId,
      amount: opened.expectedAssetAmount,
      memo: opened.memo,
    });
    await request(server)
      .post(`/stellar/escrows/${escrowId}/confirm`)
      .set(auth(buyer.accessToken))
      .send({ transactionHash: payment.transactionHash });

    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));
    await settlement.release(escrowId, buyer.userId);

    const admin = await registerAndLogin();
    await users.update({ id: admin.userId }, { role: UserRole.ADMIN });
    const adminLogin = await request(server)
      .post('/auth/login')
      .send({
        email: (await users.findOneOrFail({ where: { id: admin.userId } })).email,
        password,
      });

    const runResponse = await request(server)
      .post('/stellar/settlements/run')
      .set(auth((adminLogin.body as AuthTokensBody).accessToken));

    expect(runResponse.status).toBe(200);
    const outcome = (runResponse.body as { escrowId: string; settled: boolean }[]).find(
      (entry) => entry.escrowId === escrowId,
    );
    expect(outcome?.settled).toBe(true);

    const settled = (
      await request(server).get(`/stellar/escrows/${escrowId}`).set(auth(buyer.accessToken))
    ).body as StellarEscrowBody;
    expect(settled.status).toBe(StellarEscrowStatus.SETTLED);
    expect(settled.settlementTransactionHash).toMatch(/^[0-9a-f]{64}$/);

    const payout = await network.findPayment(settled.settlementTransactionHash as string);
    expect(payout?.to).toBe(sellerAccountId);
    expect(payout?.amount).toBe('975.0000000');

    expect(await ledger.getBalance(userWalletRef(seller.userId, 'USD'))).toEqual({
      amount: 97_500,
      currency: 'USD',
    });
  });

  it('reports a seller with no linked wallet as blocked instead of failing the sweep', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow();

    const opened = await openFunding(escrowId, buyer.accessToken);
    const payment = await network.receivePayment({
      from: randomAccountId(),
      to: opened.depositAccountId,
      amount: opened.expectedAssetAmount,
      memo: opened.memo,
    });
    await request(server)
      .post(`/stellar/escrows/${escrowId}/confirm`)
      .set(auth(buyer.accessToken))
      .send({ transactionHash: payment.transactionHash });

    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));
    await settlement.release(escrowId, buyer.userId);

    const admin = await registerAndLogin();
    await users.update({ id: admin.userId }, { role: UserRole.ADMIN });
    const adminLogin = await request(server)
      .post('/auth/login')
      .send({
        email: (await users.findOneOrFail({ where: { id: admin.userId } })).email,
        password,
      });

    const runResponse = await request(server)
      .post('/stellar/settlements/run')
      .set(auth((adminLogin.body as AuthTokensBody).accessToken));

    const outcome = (
      runResponse.body as { escrowId: string; settled: boolean; blockedBy: string | null }[]
    ).find((entry) => entry.escrowId === escrowId);
    expect(outcome?.settled).toBe(false);
    expect(outcome?.blockedBy).toContain('has not linked a Stellar wallet');
  });

  it('settles a USD escrow alongside an NGN one without the two colliding in the ledger', async () => {
    const ngn = await createAgreedEscrow({ amount: 50_000, currency: 'NGN' });
    const usd = await createAgreedEscrow({ amount: 100_000, currency: 'USD' });

    const opened = await openFunding(usd.escrowId, usd.buyer.accessToken);
    const payment = await network.receivePayment({
      from: randomAccountId(),
      to: opened.depositAccountId,
      amount: opened.expectedAssetAmount,
      memo: opened.memo,
    });
    await request(server)
      .post(`/stellar/escrows/${usd.escrowId}/confirm`)
      .set(auth(usd.buyer.accessToken))
      .send({ transactionHash: payment.transactionHash });

    await ledger.postTransaction(
      [
        {
          accountRef: providerClearingRef('paystack', 'NGN'),
          direction: EntryDirection.DEBIT,
          money: Money.of(50_000, 'NGN'),
        },
        {
          accountRef: escrowHoldingRef(ngn.escrowId),
          direction: EntryDirection.CREDIT,
          money: Money.of(50_000, 'NGN'),
        },
      ],
      { idempotencyKey: `ngn-fund:${ngn.escrowId}` },
    );
    await stateMachine.transition(ngn.escrowId, EscrowState.FUNDED, {
      actorId: null,
      reason: 'NGN rail funded',
    });

    for (const escrow of [ngn, usd]) {
      await request(server)
        .post(`/escrows/${escrow.escrowId}/ship`)
        .set(auth(escrow.seller.accessToken))
        .send({});
      await request(server)
        .post(`/escrows/${escrow.escrowId}/confirm-delivery`)
        .set(auth(escrow.buyer.accessToken));
      await settlement.release(escrow.escrowId, escrow.buyer.userId);
    }

    expect(await ledger.getBalance(platformFeeRevenueRef('NGN'))).toMatchObject({
      currency: 'NGN',
    });
    expect(await ledger.getBalance(platformFeeRevenueRef('USD'))).toMatchObject({
      currency: 'USD',
    });
    expect(await ledger.getBalance(userWalletRef(ngn.seller.userId, 'NGN'))).toEqual({
      amount: 48_750,
      currency: 'NGN',
    });
    expect(await ledger.getBalance(userWalletRef(usd.seller.userId, 'USD'))).toEqual({
      amount: 97_500,
      currency: 'USD',
    });

    const report = await reconciliation.reconcile();
    expect(report.globalBalanced).toBe(true);
    expect(report.driftedAccountRefs).toEqual([]);
  });

  it('refuses the settlement sweep to a non-admin', async () => {
    const user = await registerAndLogin();

    expect(
      (await request(server).post('/stellar/settlements/run').set(auth(user.accessToken))).status,
    ).toBe(403);
  });

  it('writes an audit trail across the whole rail: opened, funded, paid out', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow();
    const sellerAccountId = await linkWallet(seller.accessToken);
    const { transactionHash } = await fundEscrow(escrowId, buyer.accessToken);

    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));
    await settlement.release(escrowId, buyer.userId);

    const admin = await registerAdmin();
    await request(server).post('/stellar/settlements/run').set(auth(admin.accessToken));

    const trail = await auditTrail(escrowId);
    expect(trail.map((event) => event.action)).toEqual([
      'STELLAR_FUNDING_OPENED',
      'STELLAR_DEPOSIT_CONFIRMED',
      'STELLAR_SETTLEMENT_PAID',
    ]);

    const [opened, confirmed, paid] = trail;
    expect(opened.actorId).toBe(buyer.userId);
    expect(opened.correlationId).toBe(escrowId);

    expect(confirmed.actorId).toBe(buyer.userId);
    expect(confirmed.afterState).toMatchObject({
      transactionHash,
      creditedAmount: 100_000,
      creditedCurrency: 'USD',
    });

    expect(paid.actorId).toBe(admin.userId);
    expect(paid.afterState).toMatchObject({
      destinationAccountId: sellerAccountId,
      recipientUserId: seller.userId,
      amount: '975.0000000',
    });
  });

  it('records a rejected deposit without funding the escrow', async () => {
    const { escrowId, buyer } = await createAgreedEscrow();
    const opened = await openFunding(escrowId, buyer.accessToken);
    const payment = await network.receivePayment({
      from: randomAccountId(),
      to: opened.depositAccountId,
      amount: opened.expectedAssetAmount,
      memo: 'a-memo-for-another-escrow',
    });

    const response = await request(server)
      .post(`/stellar/escrows/${escrowId}/confirm`)
      .set(auth(buyer.accessToken))
      .send({ transactionHash: payment.transactionHash });

    expect(response.status).toBe(422);

    const rejected = (await auditTrail(escrowId)).find(
      (event) => event.action === 'STELLAR_DEPOSIT_REJECTED',
    );
    expect(rejected?.reason).toContain('MEMO');
    expect(rejected?.afterState).toMatchObject({ transactionHash: payment.transactionHash });
    expect((await getEscrow(escrowId, buyer.accessToken)).state).toBe(EscrowState.AGREED);
  });

  it('pays the seller exactly once when two settlement sweeps run concurrently', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow();
    await linkWallet(seller.accessToken);
    await fundEscrow(escrowId, buyer.accessToken);

    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));
    await settlement.release(escrowId, buyer.userId);

    const admin = await registerAdmin();
    const [first, second] = await Promise.all([
      request(server).post('/stellar/settlements/run').set(auth(admin.accessToken)),
      request(server).post('/stellar/settlements/run').set(auth(admin.accessToken)),
    ]);

    const outcomes = [
      ...(first.body as StellarSettlementOutcomeBody[]),
      ...(second.body as StellarSettlementOutcomeBody[]),
    ].filter((outcome) => outcome.escrowId === escrowId);

    expect(outcomes.filter((outcome) => outcome.settled)).toHaveLength(1);

    const paid = (await auditTrail(escrowId)).filter(
      (event) => event.action === 'STELLAR_SETTLEMENT_PAID',
    );
    expect(paid).toHaveLength(1);

    const settled = (
      await request(server).get(`/stellar/escrows/${escrowId}`).set(auth(buyer.accessToken))
    ).body as StellarEscrowBody;
    expect(settled.status).toBe(StellarEscrowStatus.SETTLED);
  });

  it('lets an admin requeue a payout stuck mid-settlement, and refuses one that is not stuck', async () => {
    const { escrowId, buyer, seller } = await createAgreedEscrow();
    await linkWallet(seller.accessToken);
    await fundEscrow(escrowId, buyer.accessToken);
    const admin = await registerAdmin();

    const notStuck = await request(server)
      .post(`/stellar/escrows/${escrowId}/requeue-settlement`)
      .set(auth(admin.accessToken));
    expect(notStuck.status).toBe(409);
    expect((notStuck.body as ErrorBody).code).toBe('STELLAR_SETTLEMENT_NOT_STUCK');

    await stellarEscrows.update({ escrowId }, { status: StellarEscrowStatus.SETTLING });

    const requeued = await request(server)
      .post(`/stellar/escrows/${escrowId}/requeue-settlement`)
      .set(auth(admin.accessToken));
    expect(requeued.status).toBe(200);
    expect((requeued.body as StellarEscrowBody).status).toBe(StellarEscrowStatus.FUNDED);

    const refused = await request(server)
      .post(`/stellar/escrows/${escrowId}/requeue-settlement`)
      .set(auth(buyer.accessToken));
    expect(refused.status).toBe(403);
  });

  async function releaseAndReadyToSweep(): Promise<{
    escrowId: string;
    buyer: { userId: string; accessToken: string };
    sellerAccountId: string;
  }> {
    const { escrowId, buyer, seller } = await createAgreedEscrow();
    const sellerAccountId = await linkWallet(seller.accessToken);
    await fundEscrow(escrowId, buyer.accessToken);

    await request(server).post(`/escrows/${escrowId}/ship`).set(auth(seller.accessToken)).send({});
    await request(server)
      .post(`/escrows/${escrowId}/confirm-delivery`)
      .set(auth(buyer.accessToken));
    await settlement.release(escrowId, buyer.userId);

    return { escrowId, buyer, sellerAccountId };
  }

  function interceptPayout(options: { land: boolean; expiresAt: Date }): {
    spy: jest.SpyInstance<Promise<StellarPreparedPayment>, [StellarPaymentRequest]>;
    attempted: string[];
  } {
    const prepare = network.preparePayment.bind(network);
    const attempted: string[] = [];
    const spy = jest
      .spyOn(network, 'preparePayment')
      .mockImplementationOnce(async (payoutRequest: StellarPaymentRequest) => {
        const prepared = await prepare(payoutRequest);
        attempted.push(prepared.transactionHash);
        return {
          transactionHash: prepared.transactionHash,
          expiresAt: options.expiresAt,
          submit: async (): Promise<string> => {
            if (options.land) {
              await prepared.submit();
            }
            throw new Error('horizon timed out');
          },
        };
      });
    return { spy, attempted };
  }

  async function sweep(
    accessToken: string,
    escrowId: string,
  ): Promise<StellarSettlementOutcomeBody> {
    const response = await request(server).post('/stellar/settlements/run').set(auth(accessToken));
    return (response.body as StellarSettlementOutcomeBody[]).find(
      (outcome) => outcome.escrowId === escrowId,
    ) as StellarSettlementOutcomeBody;
  }

  it('does not pay twice when a payout landed but the submission reported failure', async () => {
    const { escrowId, buyer, sellerAccountId } = await releaseAndReadyToSweep();
    const admin = await registerAdmin();

    const { spy, attempted } = interceptPayout({
      land: true,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const uncertain = await sweep(admin.accessToken, escrowId);
    expect(uncertain.settled).toBe(false);
    spy.mockRestore();

    const held = (
      await request(server).get(`/stellar/escrows/${escrowId}`).set(auth(buyer.accessToken))
    ).body as StellarEscrowBody;
    expect(held.status).toBe(StellarEscrowStatus.SETTLING);

    const reconciled = await sweep(admin.accessToken, escrowId);
    expect(reconciled.settled).toBe(true);

    const settled = (
      await request(server).get(`/stellar/escrows/${escrowId}`).set(auth(buyer.accessToken))
    ).body as StellarEscrowBody;
    expect(settled.status).toBe(StellarEscrowStatus.SETTLED);

    const payout = await network.findPayment(settled.settlementTransactionHash as string);
    expect(payout?.to).toBe(sellerAccountId);
    expect(payout?.amount).toBe('975.0000000');

    expect(settled.settlementTransactionHash).toBe(attempted[0]);

    const paid = (await auditTrail(escrowId)).filter(
      (event) => event.action === 'STELLAR_SETTLEMENT_PAID',
    );
    expect(paid).toHaveLength(1);
    expect(paid[0].reason).toContain('had already landed');
  });

  it('retries a payout that provably never applied, and pays exactly once', async () => {
    const { escrowId, buyer, sellerAccountId } = await releaseAndReadyToSweep();
    const admin = await registerAdmin();

    const { spy, attempted } = interceptPayout({
      land: false,
      expiresAt: new Date(Date.now() - 1_000),
    });
    const uncertain = await sweep(admin.accessToken, escrowId);
    expect(uncertain.settled).toBe(false);
    spy.mockRestore();

    const retried = await sweep(admin.accessToken, escrowId);
    expect(retried.settled).toBe(true);

    const settled = (
      await request(server).get(`/stellar/escrows/${escrowId}`).set(auth(buyer.accessToken))
    ).body as StellarEscrowBody;
    expect(settled.status).toBe(StellarEscrowStatus.SETTLED);

    const payout = await network.findPayment(settled.settlementTransactionHash as string);
    expect(payout?.to).toBe(sellerAccountId);
    expect(payout?.amount).toBe('975.0000000');
    expect(settled.settlementTransactionHash).not.toBe(attempted[0]);
    expect(await network.findPayment(attempted[0])).toBeNull();

    const trail = (await auditTrail(escrowId)).map((event) => event.action);
    expect(trail).toContain('STELLAR_SETTLEMENT_UNCERTAIN');
    expect(trail).toContain('STELLAR_SETTLEMENT_RECONCILED');
    expect(trail.filter((action) => action === 'STELLAR_SETTLEMENT_PAID')).toHaveLength(1);
  });

  it('refuses to retry a payout that is still in flight', async () => {
    const { escrowId, buyer } = await releaseAndReadyToSweep();
    const admin = await registerAdmin();

    const { spy } = interceptPayout({ land: false, expiresAt: new Date(Date.now() + 60_000) });
    await sweep(admin.accessToken, escrowId);
    spy.mockRestore();

    const inFlight = await sweep(admin.accessToken, escrowId);
    expect(inFlight.settled).toBe(false);
    expect(inFlight.blockedBy).toContain('still in flight');

    const held = (
      await request(server).get(`/stellar/escrows/${escrowId}`).set(auth(buyer.accessToken))
    ).body as StellarEscrowBody;
    expect(held.status).toBe(StellarEscrowStatus.SETTLING);
    expect(held.settlementTransactionHash).toBeNull();

    expect(
      (await auditTrail(escrowId)).filter((event) => event.action === 'STELLAR_SETTLEMENT_PAID'),
    ).toHaveLength(0);
  });

  it('refuses to requeue a payout that has an unresolved attempt against the chain', async () => {
    const { escrowId } = await releaseAndReadyToSweep();
    const admin = await registerAdmin();

    const { spy } = interceptPayout({ land: false, expiresAt: new Date(Date.now() + 60_000) });
    await sweep(admin.accessToken, escrowId);
    spy.mockRestore();

    const refused = await request(server)
      .post(`/stellar/escrows/${escrowId}/requeue-settlement`)
      .set(auth(admin.accessToken));

    expect(refused.status).toBe(409);
    expect((refused.body as ErrorBody).code).toBe('STELLAR_SETTLEMENT_NOT_STUCK');
  });
});
