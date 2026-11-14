import net from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { Repository } from 'typeorm';
import { EscrowState } from '../../src/escrow/entities/escrow-state.enum';
import { EscrowRole } from '../../src/escrow/entities/escrow-role.enum';
import { SettlementService } from '../../src/escrow/settlement.service';
import { User } from '../../src/database/entities/user.entity';
import { AuditEvent } from '../../src/database/entities/audit-event.entity';
import { EvidenceItem } from '../../src/database/entities/evidence-item.entity';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';
import { UserRole } from '../../src/users/entities/user-role.enum';
import { LedgerService } from '../../src/ledger/ledger.service';
import { escrowHoldingRef } from '../../src/ledger/account-refs';
import { StellarEscrowStatus } from '../../src/stellar/entities/stellar-escrow-status.enum';
import { RedisService } from '../../src/redis/redis.service';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const ASSET_CODE = 'USDC';
const PRICE_CENTS = 100_000;

net.setDefaultAutoSelectFamilyAttemptTimeout(500);

const server = new Horizon.Server(HORIZON_URL);

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
  depositAccountId: string;
  memo: string;
  expectedAssetAmount: string;
  fundingTransactionHash: string | null;
  settlementTransactionHash: string | null;
}

interface SettlementOutcomeBody {
  escrowId: string;
  settled: boolean;
  transactionHash: string | null;
  blockedBy: string | null;
}

async function withRetry<T>(label: string, attempt: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let tries = 1; tries <= attempts; tries += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if (tries < attempts) {
        await new Promise((resolve) => setTimeout(resolve, tries * 2000));
      }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${String(lastError)}`);
}

async function fundFromFriendbot(keypair: Keypair): Promise<void> {
  await withRetry(`Friendbot funding for ${keypair.publicKey()}`, async () => {
    const response = await fetch(`https://friendbot.stellar.org/?addr=${keypair.publicKey()}`);
    if (!response.ok) {
      throw new Error(`Friendbot refused with ${response.status}`);
    }
  });
}

async function submit(
  source: Keypair,
  operations: () => ReturnType<typeof Operation.payment>[],
  memo?: string,
): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
  const account = await withRetry('loadAccount', () => server.loadAccount(source.publicKey()));
  let builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  });
  for (const operation of operations()) {
    builder = builder.addOperation(operation);
  }
  if (memo) {
    builder = builder.addMemo(Memo.text(memo));
  }
  const transaction = builder.setTimeout(90).build();
  transaction.sign(source);
  return server.submitTransaction(transaction);
}

async function balanceOf(publicKey: string, asset: Asset): Promise<number> {
  const account = await server.loadAccount(publicKey);
  const holding = account.balances.find(
    (balance) =>
      'asset_code' in balance &&
      balance.asset_code === asset.getCode() &&
      balance.asset_issuer === asset.getIssuer(),
  );
  return holding ? Number(holding.balance) : 0;
}

const runTestnet = process.env.STELLAR_TESTNET_E2E === '1';
const maybeDescribe = runTestnet ? describe : describe.skip;

maybeDescribe('Stellar rail against live testnet (e2e)', () => {
  jest.setTimeout(300_000);

  let app: INestApplication;
  let httpServer: Server;
  let users: Repository<User>;
  let auditEvents: Repository<AuditEvent>;
  let evidenceItems: Repository<EvidenceItem>;
  let ledger: LedgerService;
  let settlement: SettlementService;
  let redis: RedisService;

  const issuer = Keypair.random();
  const custody = Keypair.random();
  const buyerWallet = Keypair.random();
  const sellerWallet = Keypair.random();
  const asset = new Asset(ASSET_CODE, issuer.publicKey());

  const password = 'super-secret-password';
  let userCounter = 0;

  function uniqueEmail(): string {
    userCounter += 1;
    return `stellar-testnet-${Date.now()}-${userCounter}@example.com`;
  }

  function auth(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  async function registerAndLogin(): Promise<{ userId: string; accessToken: string }> {
    const email = uniqueEmail();
    await request(httpServer).post('/auth/register').send({ email, password });
    await users.update({ email }, { emailVerifiedAt: new Date() });
    const login = await request(httpServer).post('/auth/login').send({ email, password });
    if (login.status !== 200 && login.status !== 201) {
      throw new Error(`login failed ${login.status}: ${JSON.stringify(login.body)}`);
    }
    const body = login.body as AuthTokensBody;
    return { userId: body.user.id, accessToken: body.accessToken };
  }

  beforeAll(async () => {
    await Promise.all([issuer, custody, buyerWallet, sellerWallet].map(fundFromFriendbot));
    for (const holder of [custody, buyerWallet, sellerWallet]) {
      await submit(holder, () => [Operation.changeTrust({ asset })] as never);
    }
    await submit(issuer, () => [
      Operation.payment({ destination: buyerWallet.publicKey(), asset, amount: '5000.0000000' }),
    ]);

    process.env.STELLAR_MODE = 'live';
    process.env.STELLAR_NETWORK = 'testnet';
    process.env.STELLAR_ASSET_CODE = ASSET_CODE;
    process.env.STELLAR_ASSET_ISSUER = issuer.publicKey();
    process.env.STELLAR_HORIZON_URL = HORIZON_URL;
    process.env.STELLAR_CUSTODY_SECRET = custody.secret();

    const { AppModule } = (await import('../../src/app.module')) as {
      AppModule: new () => unknown;
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    httpServer = app.getHttpServer() as Server;
    users = app.get<Repository<User>>(getRepositoryToken(User));
    auditEvents = app.get<Repository<AuditEvent>>(getRepositoryToken(AuditEvent));
    evidenceItems = app.get<Repository<EvidenceItem>>(getRepositoryToken(EvidenceItem));
    ledger = app.get(LedgerService);
    settlement = app.get(SettlementService);
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('funds, releases and pays out a real escrow over Stellar testnet', async () => {
    const buyer = await registerAndLogin();
    const seller = await registerAndLogin();
    await users.update({ id: buyer.userId }, { kycTier: KycTier.TIER_1 });

    const draftResponse = await request(httpServer)
      .post('/escrows')
      .set(auth(buyer.accessToken))
      .send({
        price: { amount: PRICE_CENTS, currency: 'USD' },
        inspectionWindowHours: 48,
        deliveryMethod: 'courier',
        itemDescription: 'A vintage camera',
        feeBps: 250,
        role: EscrowRole.BUYER,
      });
    const draft = draftResponse.body as EscrowDetailBody;

    await evidenceItems.save(
      evidenceItems.create({
        escrowId: draft.id,
        uploaderId: buyer.userId,
        phase: EvidencePhase.AT_CREATION,
        storageKey: `evidence/${draft.id}/seed-${randomUUID()}`,
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

    const invite = (
      await request(httpServer).post(`/escrows/${draft.id}/invite`).set(auth(buyer.accessToken))
    ).body as { token: string };
    await request(httpServer).post(`/invites/${invite.token}/accept`).set(auth(seller.accessToken));
    await request(httpServer)
      .post(`/escrows/${draft.id}/accept-terms`)
      .set(auth(buyer.accessToken));
    await request(httpServer)
      .post(`/escrows/${draft.id}/accept-terms`)
      .set(auth(seller.accessToken));

    const challenge = (
      await request(httpServer)
        .post('/stellar/wallet/challenge')
        .set(auth(seller.accessToken))
        .send({ accountId: sellerWallet.publicKey() })
    ).body as { message: string };
    const linked = await request(httpServer)
      .post('/stellar/wallet')
      .set(auth(seller.accessToken))
      .send({
        accountId: sellerWallet.publicKey(),
        signature: sellerWallet.sign(Buffer.from(challenge.message, 'utf8')).toString('base64'),
      });
    expect(linked.status).toBe(200);

    const opened = (
      await request(httpServer)
        .post(`/stellar/escrows/${draft.id}/fund`)
        .set(auth(buyer.accessToken))
    ).body as StellarEscrowBody;
    expect(opened.depositAccountId).toBe(custody.publicKey());
    expect(opened.expectedAssetAmount).toBe('1000.0000000');

    const depositTx = await submit(
      buyerWallet,
      () => [
        Operation.payment({
          destination: opened.depositAccountId,
          asset,
          amount: opened.expectedAssetAmount,
        }),
      ],
      opened.memo,
    );

    const confirmed = await request(httpServer)
      .post(`/stellar/escrows/${draft.id}/confirm`)
      .set(auth(buyer.accessToken))
      .send({ transactionHash: depositTx.hash });
    expect(confirmed.status).toBe(200);
    expect((confirmed.body as StellarEscrowBody).status).toBe(StellarEscrowStatus.FUNDED);

    const funded = (
      await request(httpServer).get(`/escrows/${draft.id}`).set(auth(buyer.accessToken))
    ).body as EscrowDetailBody;
    expect(funded.state).toBe(EscrowState.FUNDED);
    expect(await ledger.getBalance(escrowHoldingRef(draft.id))).toEqual({
      amount: PRICE_CENTS,
      currency: 'USD',
    });

    await request(httpServer)
      .post(`/escrows/${draft.id}/ship`)
      .set(auth(seller.accessToken))
      .send({});
    await request(httpServer)
      .post(`/escrows/${draft.id}/confirm-delivery`)
      .set(auth(buyer.accessToken));
    await settlement.release(draft.id, buyer.userId);

    const admin = await registerAndLogin();
    await users.update({ id: admin.userId }, { role: UserRole.ADMIN });
    const adminEmail = (await users.findOneOrFail({ where: { id: admin.userId } })).email;
    const adminToken = (
      (await request(httpServer).post('/auth/login').send({ email: adminEmail, password }))
        .body as AuthTokensBody
    ).accessToken;

    const sellerBefore = await balanceOf(sellerWallet.publicKey(), asset);

    const sweep = await request(httpServer).post('/stellar/settlements/run').set(auth(adminToken));
    expect(sweep.status).toBe(200);
    const outcome = (sweep.body as SettlementOutcomeBody[]).find(
      (entry) => entry.escrowId === draft.id,
    );
    expect(outcome?.settled).toBe(true);
    expect(outcome?.transactionHash).toMatch(/^[0-9a-f]{64}$/);

    const sellerAfter = await balanceOf(sellerWallet.publicKey(), asset);
    expect((sellerAfter - sellerBefore).toFixed(7)).toBe('975.0000000');

    const settled = (
      await request(httpServer).get(`/stellar/escrows/${draft.id}`).set(auth(buyer.accessToken))
    ).body as StellarEscrowBody;
    expect(settled.status).toBe(StellarEscrowStatus.SETTLED);
    expect(settled.settlementTransactionHash).toBe(outcome?.transactionHash);

    const payout = await server
      .payments()
      .forTransaction(outcome?.transactionHash as string)
      .call();
    const record = payout.records[0] as Horizon.ServerApi.PaymentOperationRecord;
    expect(record.to).toBe(sellerWallet.publicKey());
    expect(record.amount).toBe('975.0000000');

    const trail = await auditEvents.find({
      where: { entityType: 'stellar_escrow', entityId: draft.id },
      order: { createdAt: 'ASC' },
    });
    expect(trail.map((event) => event.action)).toEqual([
      'STELLAR_FUNDING_OPENED',
      'STELLAR_DEPOSIT_CONFIRMED',
      'STELLAR_SETTLEMENT_PAID',
    ]);
  });

  it('refuses a real on-chain payment that carries the wrong memo', async () => {
    const buyer = await registerAndLogin();
    const seller = await registerAndLogin();
    await users.update({ id: buyer.userId }, { kycTier: KycTier.TIER_1 });

    const draft = (
      await request(httpServer)
        .post('/escrows')
        .set(auth(buyer.accessToken))
        .send({
          price: { amount: PRICE_CENTS, currency: 'USD' },
          inspectionWindowHours: 48,
          deliveryMethod: 'courier',
          itemDescription: 'A vintage lens',
          feeBps: 250,
          role: EscrowRole.BUYER,
        })
    ).body as EscrowDetailBody;

    await evidenceItems.save(
      evidenceItems.create({
        escrowId: draft.id,
        uploaderId: buyer.userId,
        phase: EvidencePhase.AT_CREATION,
        storageKey: `evidence/${draft.id}/seed-${randomUUID()}`,
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

    const invite = (
      await request(httpServer).post(`/escrows/${draft.id}/invite`).set(auth(buyer.accessToken))
    ).body as { token: string };
    await request(httpServer).post(`/invites/${invite.token}/accept`).set(auth(seller.accessToken));
    await request(httpServer)
      .post(`/escrows/${draft.id}/accept-terms`)
      .set(auth(buyer.accessToken));
    await request(httpServer)
      .post(`/escrows/${draft.id}/accept-terms`)
      .set(auth(seller.accessToken));

    const opened = (
      await request(httpServer)
        .post(`/stellar/escrows/${draft.id}/fund`)
        .set(auth(buyer.accessToken))
    ).body as StellarEscrowBody;

    const strayTx = await submit(
      buyerWallet,
      () => [
        Operation.payment({
          destination: opened.depositAccountId,
          asset,
          amount: opened.expectedAssetAmount,
        }),
      ],
      'someone-elses-escrow',
    );

    const rejected = await request(httpServer)
      .post(`/stellar/escrows/${draft.id}/confirm`)
      .set(auth(buyer.accessToken))
      .send({ transactionHash: strayTx.hash });

    expect(rejected.status).toBe(422);
    expect((rejected.body as { code: string }).code).toBe('STELLAR_DEPOSIT_MISMATCH');

    const still = (
      await request(httpServer).get(`/escrows/${draft.id}`).set(auth(buyer.accessToken))
    ).body as EscrowDetailBody;
    expect(still.state).toBe(EscrowState.AGREED);

    const rejectedEvent = (
      await auditEvents.find({ where: { entityType: 'stellar_escrow', entityId: draft.id } })
    ).find((event) => event.action === 'STELLAR_DEPOSIT_REJECTED');
    expect(rejectedEvent?.reason).toContain('MEMO');
  });
});
