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
import { SettlementService } from '../../src/escrow/settlement.service';
import { User } from '../../src/database/entities/user.entity';
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

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
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

  async function linkWallet(accessToken: string, accountId = randomAccountId()): Promise<string> {
    await request(server).post('/stellar/wallet').set(auth(accessToken)).send({ accountId });
    return accountId;
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
      network: 'testnet',
      asset: { code: 'USDC', issuer: expect.stringMatching(/^G[A-Z2-7]{55}$/) as string },
    });
  });

  it('links, reads back, and unlinks a Stellar wallet', async () => {
    const user = await registerAndLogin();
    const accountId = randomAccountId();

    const linkResponse = await request(server)
      .post('/stellar/wallet')
      .set(auth(user.accessToken))
      .send({ accountId });
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

    const response = await request(server)
      .post('/stellar/wallet')
      .set(auth(user.accessToken))
      .send({ accountId: `G${'A'.repeat(55)}` });

    expect(response.status).toBe(400);
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
      (await request(server).post(`/stellar/escrows/${escrowId}/fund`).set(auth(seller.accessToken)))
        .status,
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
    await request(server).post(`/escrows/${escrowId}/confirm-delivery`).set(auth(buyer.accessToken));
    await settlement.release(escrowId, buyer.userId);

    const admin = await registerAndLogin();
    await users.update({ id: admin.userId }, { role: UserRole.ADMIN });
    const adminLogin = await request(server)
      .post('/auth/login')
      .send({ email: (await users.findOneOrFail({ where: { id: admin.userId } })).email, password });

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
    await request(server).post(`/escrows/${escrowId}/confirm-delivery`).set(auth(buyer.accessToken));
    await settlement.release(escrowId, buyer.userId);

    const admin = await registerAndLogin();
    await users.update({ id: admin.userId }, { role: UserRole.ADMIN });
    const adminLogin = await request(server)
      .post('/auth/login')
      .send({ email: (await users.findOneOrFail({ where: { id: admin.userId } })).email, password });

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
});
