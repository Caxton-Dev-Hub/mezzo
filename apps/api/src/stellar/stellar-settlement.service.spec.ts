import { randomBytes } from 'node:crypto';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { StellarEscrow } from '../database/entities/stellar-escrow.entity';
import { StellarAccount } from '../database/entities/stellar-account.entity';
import { AuditService } from '../audit/audit.service';
import { StellarSettlementService } from './stellar-settlement.service';
import { StellarConfigService } from './stellar-config.service';
import { StellarWalletService } from './stellar-wallet.service';
import { StellarEscrowStatus } from './entities/stellar-escrow-status.enum';
import { encodeStellarAccountId } from './stellar-account-id';
import { StellarNetworkClient } from './providers/stellar-network.interface';
import { StellarAccountNotLinkedError } from './errors/stellar-account-not-linked.error';
import { StellarRailDisabledError } from './errors/stellar-rail-disabled.error';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { callArg, callArgs } from '../../test/support/mock-calls';

const ESCROW_ID = '11111111-2222-3333-4444-555555555555';
const BUYER_ID = 'buyer-1';
const SELLER_ID = 'seller-1';
const PRICE_CENTS = 100_000;
const FEE_BPS = 250;
const DEPOSIT_ACCOUNT = encodeStellarAccountId(randomBytes(32));
const RECIPIENT_ACCOUNT = encodeStellarAccountId(randomBytes(32));
const SETTLEMENT_HASH = randomBytes(32).toString('hex');
const MEMO = ESCROW_ID.replace(/-/g, '').slice(0, 28);

function buildStellarEscrow(): StellarEscrow {
  return {
    id: 'stellar-escrow-1',
    escrowId: ESCROW_ID,
    network: 'testnet',
    depositAccountId: DEPOSIT_ACCOUNT,
    memo: MEMO,
    assetCode: 'USDC',
    assetIssuer: encodeStellarAccountId(randomBytes(32)),
    expectedAmount: PRICE_CENTS,
    expectedCurrency: 'USD',
    status: StellarEscrowStatus.FUNDED,
    fundingTransactionHash: randomBytes(32).toString('hex'),
    settlementTransactionHash: null,
    settlementAttemptHash: null,
    settlementAttemptExpiresAt: null,
  } as StellarEscrow;
}

interface Harness {
  service: StellarSettlementService;
  update: jest.Mock;
  rows: StellarEscrow[];
  preparePayment: jest.Mock;
  submit: jest.Mock;
  findTransaction: jest.Mock;
  findOrThrow: jest.Mock;
  record: jest.Mock;
}

interface AuditEventCall {
  action: string;
  after: Record<string, unknown>;
}

function auditEvents(record: jest.Mock): AuditEventCall[] {
  return callArgs(record).map((call) => call[0] as AuditEventCall);
}

function auditActions(record: jest.Mock): string[] {
  return auditEvents(record).map((event) => event.action);
}

function buildHarness(
  options: {
    due?: StellarEscrow[];
    escrowState?: EscrowState;
    linked?: boolean;
    enabled?: boolean;
    chainOutcome?: { transactionHash: string; successful: boolean } | null;
    attemptExpiresAt?: Date;
  } = {},
): Harness {
  const rows = options.due ?? [buildStellarEscrow()];
  const update = jest
    .fn()
    .mockImplementation(
      (
        criteria: Partial<StellarEscrow>,
        patch: Partial<StellarEscrow>,
      ): Promise<{ affected: number }> => {
        const matched = rows.filter(
          (row) =>
            (criteria.id === undefined || row.id === criteria.id) &&
            (criteria.escrowId === undefined || row.escrowId === criteria.escrowId) &&
            (criteria.status === undefined || row.status === criteria.status),
        );
        for (const row of matched) {
          Object.assign(row, patch);
        }
        return Promise.resolve({ affected: matched.length });
      },
    );
  const queryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockImplementation(() => Promise.resolve([...rows])),
  } as unknown as SelectQueryBuilder<StellarEscrow>;
  const stellarEscrows = {
    update,
    createQueryBuilder: () => queryBuilder,
    findOneOrFail: jest
      .fn()
      .mockImplementation(({ where }: { where: { escrowId: string } }) =>
        Promise.resolve(rows.find((row) => row.escrowId === where.escrowId)),
      ),
  } as unknown as Repository<StellarEscrow>;

  const submit = jest.fn().mockResolvedValue(SETTLEMENT_HASH);
  const preparePayment = jest.fn().mockImplementation(() =>
    Promise.resolve({
      transactionHash: SETTLEMENT_HASH,
      expiresAt: options.attemptExpiresAt ?? new Date(Date.now() + 60_000),
      submit,
    }),
  );
  const findTransaction = jest.fn().mockResolvedValue(options.chainOutcome ?? null);
  const network = {
    name: 'testnet',
    asset: { code: 'USDC', issuer: encodeStellarAccountId(randomBytes(32)) },
    openDepositAddress: jest.fn(),
    findPayment: jest.fn(),
    preparePayment,
    findTransaction,
  } as unknown as StellarNetworkClient;

  const enabled = options.enabled ?? true;
  const stellarConfig = {
    isEnabled: () => enabled,
    assertEnabled: () => {
      if (!enabled) {
        throw new StellarRailDisabledError();
      }
    },
    networkName: 'testnet',
  } as unknown as StellarConfigService;

  const escrowService = {
    getDetail: jest.fn().mockResolvedValue({
      escrow: { id: ESCROW_ID, state: options.escrowState ?? EscrowState.RELEASED, version: 9 },
      terms: { priceAmount: PRICE_CENTS, priceCurrency: 'USD', feeBps: FEE_BPS },
      parties: [
        { userId: BUYER_ID, role: EscrowRole.BUYER },
        { userId: SELLER_ID, role: EscrowRole.SELLER },
      ],
    }),
  } as unknown as EscrowService;

  const findOrThrow = jest.fn().mockImplementation((userId: string) => {
    if (options.linked === false) {
      return Promise.reject(new StellarAccountNotLinkedError(userId));
    }
    return Promise.resolve({ userId, accountId: RECIPIENT_ACCOUNT } as StellarAccount);
  });
  const walletService = { findOrThrow } as unknown as StellarWalletService;

  const record = jest.fn().mockResolvedValue(undefined);
  const auditService = { record } as unknown as AuditService;

  return {
    service: new StellarSettlementService(
      stellarEscrows,
      network,
      stellarConfig,
      escrowService,
      walletService,
      auditService,
    ),
    update,
    rows,
    preparePayment,
    submit,
    findTransaction,
    findOrThrow,
    record,
  };
}

describe('StellarSettlementService.settleDue', () => {
  it('pays the seller the price net of the platform fee on a released escrow', async () => {
    const harness = buildHarness({ escrowState: EscrowState.RELEASED });

    const [outcome] = await harness.service.settleDue();

    expect(harness.findOrThrow).toHaveBeenCalledWith(SELLER_ID);
    expect(harness.preparePayment).toHaveBeenCalledWith({
      from: DEPOSIT_ACCOUNT,
      to: RECIPIENT_ACCOUNT,
      amount: '975.0000000',
      memo: MEMO,
    });
    expect(outcome).toEqual({
      escrowId: ESCROW_ID,
      settled: true,
      transactionHash: SETTLEMENT_HASH,
      blockedBy: null,
    });
  });

  it('pays the buyer the whole price on a refunded escrow, with no fee taken', async () => {
    const harness = buildHarness({ escrowState: EscrowState.REFUNDED });

    await harness.service.settleDue();

    expect(harness.findOrThrow).toHaveBeenCalledWith(BUYER_ID);
    expect(callArg<{ amount: string }>(harness.preparePayment, 0, 0).amount).toBe('1000.0000000');
  });

  it('marks the escrow settled with the submitted transaction hash', async () => {
    const harness = buildHarness();

    await harness.service.settleDue();

    expect(harness.rows[0].status).toBe(StellarEscrowStatus.SETTLED);
    expect(harness.rows[0].settlementTransactionHash).toBe(SETTLEMENT_HASH);
  });

  it('claims the row before it submits, so the payout cannot be sent twice', async () => {
    const harness = buildHarness();

    await harness.service.settleDue();

    const claimIndex = callArgs(harness.update).findIndex(
      (call) => (call[1] as Partial<StellarEscrow>).status === StellarEscrowStatus.SETTLING,
    );
    expect(claimIndex).toBe(0);
    expect(callArg<Partial<StellarEscrow>>(harness.update, claimIndex, 0)).toEqual({
      id: 'stellar-escrow-1',
      status: StellarEscrowStatus.FUNDED,
    });
    expect(harness.submit.mock.invocationCallOrder[0]).toBeGreaterThan(
      harness.update.mock.invocationCallOrder[claimIndex],
    );
  });

  it('pays only once when two sweeps race over the same escrow', async () => {
    const harness = buildHarness();

    const [first, second] = await Promise.all([
      harness.service.settleDue(),
      harness.service.settleDue(),
    ]);

    expect(harness.submit).toHaveBeenCalledTimes(1);
    const settled = [...first, ...second].filter((outcome) => outcome.settled);
    expect(settled).toHaveLength(1);
    const lost = [...first, ...second].find((outcome) => !outcome.settled);
    expect(lost?.blockedBy).toBe('Another settlement run already holds this payout');
  });

  it('records an uncertain submission against the chain instead of losing it', async () => {
    const harness = buildHarness();
    harness.submit.mockRejectedValueOnce(new Error('horizon timed out'));

    const [outcome] = await harness.service.settleDue();

    expect(outcome.settled).toBe(false);
    expect(outcome.blockedBy).toContain('reconciled against the chain');
    expect(harness.rows[0].status).toBe(StellarEscrowStatus.SETTLING);
    expect(harness.rows[0].settlementAttemptHash).toBe(SETTLEMENT_HASH);
    expect(harness.rows[0].settlementTransactionHash).toBeNull();
    expect(auditActions(harness.record)).toContain('STELLAR_SETTLEMENT_UNCERTAIN');
  });

  it('settles from the chain when an uncertain payout turns out to have landed', async () => {
    const harness = buildHarness();
    harness.submit.mockRejectedValueOnce(new Error('horizon timed out'));

    await harness.service.settleDue();
    harness.findTransaction.mockResolvedValue({
      transactionHash: SETTLEMENT_HASH,
      successful: true,
    });

    const [outcome] = await harness.service.settleDue();

    expect(outcome.settled).toBe(true);
    expect(outcome.transactionHash).toBe(SETTLEMENT_HASH);
    expect(harness.rows[0].status).toBe(StellarEscrowStatus.SETTLED);
    expect(harness.rows[0].settlementTransactionHash).toBe(SETTLEMENT_HASH);
    expect(harness.rows[0].settlementAttemptHash).toBeNull();
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.preparePayment).toHaveBeenCalledTimes(1);
  });

  it('retries only once a payout has provably expired without applying', async () => {
    const harness = buildHarness({ attemptExpiresAt: new Date(Date.now() - 1_000) });
    harness.submit.mockRejectedValueOnce(new Error('horizon timed out'));

    await harness.service.settleDue();
    const [outcome] = await harness.service.settleDue();

    expect(outcome.settled).toBe(true);
    expect(harness.rows[0].status).toBe(StellarEscrowStatus.SETTLED);
    expect(harness.submit).toHaveBeenCalledTimes(2);
    expect(auditActions(harness.record)).toContain('STELLAR_SETTLEMENT_RECONCILED');
  });

  it('will not retry a payout that is still within its time bounds', async () => {
    const harness = buildHarness({ attemptExpiresAt: new Date(Date.now() + 60_000) });
    harness.submit.mockRejectedValueOnce(new Error('horizon timed out'));

    await harness.service.settleDue();
    const [outcome] = await harness.service.settleDue();

    expect(outcome.settled).toBe(false);
    expect(outcome.blockedBy).toContain('still in flight');
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.rows[0].status).toBe(StellarEscrowStatus.SETTLING);
  });

  it('releases the claim when a payout cannot even be prepared', async () => {
    const harness = buildHarness();
    harness.preparePayment.mockRejectedValueOnce(new Error('horizon unreachable'));

    const [outcome] = await harness.service.settleDue();

    expect(outcome.settled).toBe(false);
    expect(outcome.blockedBy).toContain('nothing was submitted');
    expect(harness.rows[0].status).toBe(StellarEscrowStatus.FUNDED);
    expect(harness.rows[0].settlementAttemptHash).toBeNull();
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it('records the payout in the audit trail with its destination and amount', async () => {
    const harness = buildHarness();

    await harness.service.settleDue();

    const paid = auditEvents(harness.record).find(
      (event) => event.action === 'STELLAR_SETTLEMENT_PAID',
    );
    expect(paid?.after).toMatchObject({
      transactionHash: SETTLEMENT_HASH,
      recipientUserId: SELLER_ID,
      destinationAccountId: RECIPIENT_ACCOUNT,
      amount: '975.0000000',
    });
  });

  it('reports a party with no linked wallet as blocked instead of failing the sweep', async () => {
    const harness = buildHarness({ linked: false });

    const [outcome] = await harness.service.settleDue();

    expect(outcome.settled).toBe(false);
    expect(outcome.blockedBy).toContain('has not linked a Stellar wallet');
    expect(harness.submit).not.toHaveBeenCalled();
    expect(harness.rows[0].status).toBe(StellarEscrowStatus.FUNDED);
    expect(auditActions(harness.record)).toContain('STELLAR_SETTLEMENT_BLOCKED');
  });

  it('does nothing when no escrow is due', async () => {
    const harness = buildHarness({ due: [] });

    await expect(harness.service.settleDue()).resolves.toEqual([]);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it('refuses to sweep while the rail is off', async () => {
    const harness = buildHarness({ enabled: false });

    await expect(harness.service.settleDue()).rejects.toThrow(StellarRailDisabledError);
  });
});
