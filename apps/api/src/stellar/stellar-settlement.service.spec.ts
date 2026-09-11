import { randomBytes } from 'node:crypto';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { StellarEscrow } from '../database/entities/stellar-escrow.entity';
import { StellarAccount } from '../database/entities/stellar-account.entity';
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
import { callArg } from '../../test/support/mock-calls';

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
  } as StellarEscrow;
}

interface Harness {
  service: StellarSettlementService;
  save: jest.Mock;
  sendPayment: jest.Mock;
  findOrThrow: jest.Mock;
}

function buildHarness(
  options: {
    due?: StellarEscrow[];
    escrowState?: EscrowState;
    linked?: boolean;
    enabled?: boolean;
  } = {},
): Harness {
  const save = jest.fn().mockImplementation((row: StellarEscrow) => Promise.resolve(row));
  const queryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(options.due ?? [buildStellarEscrow()]),
  } as unknown as SelectQueryBuilder<StellarEscrow>;
  const stellarEscrows = {
    save,
    createQueryBuilder: () => queryBuilder,
  } as unknown as Repository<StellarEscrow>;

  const sendPayment = jest.fn().mockResolvedValue(SETTLEMENT_HASH);
  const network = {
    name: 'testnet',
    asset: { code: 'USDC', issuer: encodeStellarAccountId(randomBytes(32)) },
    openDepositAddress: jest.fn(),
    findPayment: jest.fn(),
    sendPayment,
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

  return {
    service: new StellarSettlementService(
      stellarEscrows,
      network,
      stellarConfig,
      escrowService,
      walletService,
    ),
    save,
    sendPayment,
    findOrThrow,
  };
}

describe('StellarSettlementService.settleDue', () => {
  it('pays the seller the price net of the platform fee on a released escrow', async () => {
    const harness = buildHarness({ escrowState: EscrowState.RELEASED });

    const [outcome] = await harness.service.settleDue();

    expect(harness.findOrThrow).toHaveBeenCalledWith(SELLER_ID);
    expect(harness.sendPayment).toHaveBeenCalledWith({
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
    expect(callArg<{ amount: string }>(harness.sendPayment, 0, 0).amount).toBe('1000.0000000');
  });

  it('marks the escrow settled with the submitted transaction hash', async () => {
    const harness = buildHarness();

    await harness.service.settleDue();

    const saved = callArg<StellarEscrow>(harness.save, 0, 0);
    expect(saved.status).toBe(StellarEscrowStatus.SETTLED);
    expect(saved.settlementTransactionHash).toBe(SETTLEMENT_HASH);
  });

  it('reports a party with no linked wallet as blocked instead of failing the sweep', async () => {
    const harness = buildHarness({ linked: false });

    const [outcome] = await harness.service.settleDue();

    expect(outcome.settled).toBe(false);
    expect(outcome.blockedBy).toContain('has not linked a Stellar wallet');
    expect(harness.sendPayment).not.toHaveBeenCalled();
    expect(harness.save).not.toHaveBeenCalled();
  });

  it('does nothing when no escrow is due', async () => {
    const harness = buildHarness({ due: [] });

    await expect(harness.service.settleDue()).resolves.toEqual([]);
    expect(harness.sendPayment).not.toHaveBeenCalled();
  });

  it('refuses to sweep while the rail is off', async () => {
    const harness = buildHarness({ enabled: false });

    await expect(harness.service.settleDue()).rejects.toThrow(StellarRailDisabledError);
  });
});
