import { randomBytes } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { StellarEscrow } from '../database/entities/stellar-escrow.entity';
import { StellarEscrowService } from './stellar-escrow.service';
import { StellarConfigService } from './stellar-config.service';
import { StellarEscrowStatus } from './entities/stellar-escrow-status.enum';
import { STELLAR_LEDGER_PROVIDER } from './stellar-ledger-provider.constant';
import { encodeStellarAccountId } from './stellar-account-id';
import { StellarNetworkClient, StellarPayment } from './providers/stellar-network.interface';
import { StellarFundingUnavailableError } from './errors/stellar-funding-unavailable.error';
import { StellarDepositNotFoundError } from './errors/stellar-deposit-not-found.error';
import { StellarDepositMismatchError } from './errors/stellar-deposit-mismatch.error';
import { StellarSimulationUnavailableError } from './errors/stellar-simulation-unavailable.error';
import { UnsupportedStellarCurrencyError } from './errors/unsupported-stellar-currency.error';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowStateMachine } from '../escrow/escrow-state-machine';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { OnlyBuyerMayActError } from '../escrow/errors/only-buyer-may-act.error';
import { LedgerService, PostingLine } from '../ledger/ledger.service';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { escrowHoldingRef, providerClearingRef } from '../ledger/account-refs';
import { Money } from '../common/money/money';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/entities/notification-event-type.enum';
import { callArg } from '../../test/support/mock-calls';

const ESCROW_ID = '11111111-2222-3333-4444-555555555555';
const BUYER_ID = 'buyer-1';
const SELLER_ID = 'seller-1';
const PRICE_CENTS = 25_000;
const DEPOSIT_ACCOUNT = encodeStellarAccountId(randomBytes(32));
const MEMO = ESCROW_ID.replace(/-/g, '').slice(0, 28);
const TX_HASH = randomBytes(32).toString('hex');
const ASSET = { code: 'USDC', issuer: encodeStellarAccountId(randomBytes(32)) };

function buildStellarEscrow(overrides: Partial<StellarEscrow> = {}): StellarEscrow {
  return {
    id: 'stellar-escrow-1',
    escrowId: ESCROW_ID,
    network: 'testnet',
    depositAccountId: DEPOSIT_ACCOUNT,
    memo: MEMO,
    assetCode: ASSET.code,
    assetIssuer: ASSET.issuer,
    expectedAmount: PRICE_CENTS,
    expectedCurrency: 'USD',
    status: StellarEscrowStatus.AWAITING_DEPOSIT,
    fundingTransactionHash: null,
    settlementTransactionHash: null,
    ...overrides,
  } as StellarEscrow;
}

function buildPayment(overrides: Partial<StellarPayment> = {}): StellarPayment {
  return {
    transactionHash: TX_HASH,
    from: encodeStellarAccountId(randomBytes(32)),
    to: DEPOSIT_ACCOUNT,
    memo: MEMO,
    asset: ASSET,
    amount: '250.0000000',
    ...overrides,
  };
}

interface Harness {
  service: StellarEscrowService;
  findOne: jest.Mock;
  save: jest.Mock;
  managerSave: jest.Mock;
  openDepositAddress: jest.Mock;
  findPayment: jest.Mock;
  receivePayment: jest.Mock;
  postTransaction: jest.Mock;
  transition: jest.Mock;
  notify: jest.Mock;
  assertIsParty: jest.Mock;
}

function buildHarness(
  options: {
    stellarEscrow?: StellarEscrow | null;
    escrowState?: EscrowState;
    priceCurrency?: 'NGN' | 'USD';
    payment?: StellarPayment | null;
    simulated?: boolean;
  } = {},
): Harness {
  const findOne = jest.fn().mockResolvedValue(options.stellarEscrow ?? null);
  const save = jest.fn().mockImplementation((row: StellarEscrow) => Promise.resolve(row));
  const stellarEscrows = {
    findOne,
    save,
    create: (values: Partial<StellarEscrow>) => ({ ...values }) as StellarEscrow,
  } as unknown as Repository<StellarEscrow>;

  const managerSave = jest.fn().mockResolvedValue(undefined);
  const manager = { save: managerSave } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
  } as unknown as DataSource;

  const openDepositAddress = jest
    .fn()
    .mockResolvedValue({ accountId: DEPOSIT_ACCOUNT, memo: MEMO });
  const findPayment = jest.fn().mockResolvedValue(options.payment ?? null);
  const receivePayment = jest.fn().mockResolvedValue(buildPayment());
  const network = {
    name: 'testnet',
    asset: ASSET,
    openDepositAddress,
    findPayment,
    sendPayment: jest.fn(),
    ...(options.simulated === false ? {} : { receivePayment }),
  } as unknown as StellarNetworkClient;

  const stellarConfig = {
    isEnabled: () => true,
    assertEnabled: () => undefined,
    networkName: 'testnet',
    asset: ASSET,
  } as unknown as StellarConfigService;

  const assertIsParty = jest.fn().mockResolvedValue(undefined);
  const escrowService = {
    assertIsParty,
    getDetail: jest.fn().mockResolvedValue({
      escrow: { id: ESCROW_ID, state: options.escrowState ?? EscrowState.AGREED, version: 3 },
      terms: {
        priceAmount: PRICE_CENTS,
        priceCurrency: options.priceCurrency ?? 'USD',
        feeBps: 250,
      },
      parties: [
        { userId: BUYER_ID, role: EscrowRole.BUYER },
        { userId: SELLER_ID, role: EscrowRole.SELLER },
      ],
    }),
  } as unknown as EscrowService;

  const transition = jest.fn().mockResolvedValue({ id: ESCROW_ID, state: EscrowState.FUNDED });
  const stateMachine = { transition } as unknown as EscrowStateMachine;

  const postTransaction = jest.fn().mockResolvedValue({ id: 'posting-1' });
  const ledgerService = { postTransaction } as unknown as LedgerService;

  const notify = jest.fn().mockResolvedValue(undefined);
  const notificationsService = { notify } as unknown as NotificationsService;

  const service = new StellarEscrowService(
    stellarEscrows,
    dataSource,
    network,
    stellarConfig,
    escrowService,
    stateMachine,
    ledgerService,
    notificationsService,
  );

  return {
    service,
    findOne,
    save,
    managerSave,
    openDepositAddress,
    findPayment,
    receivePayment,
    postTransaction,
    transition,
    notify,
    assertIsParty,
  };
}

describe('StellarEscrowService.openFunding', () => {
  it('opens a deposit address for the buyer on an agreed escrow', async () => {
    const harness = buildHarness();

    const stellarEscrow = await harness.service.openFunding(ESCROW_ID, BUYER_ID);

    expect(stellarEscrow.depositAccountId).toBe(DEPOSIT_ACCOUNT);
    expect(stellarEscrow.memo).toBe(MEMO);
    expect(stellarEscrow.expectedAmount).toBe(PRICE_CENTS);
    expect(stellarEscrow.expectedCurrency).toBe('USD');
    expect(stellarEscrow.status).toBe(StellarEscrowStatus.AWAITING_DEPOSIT);
  });

  it('returns the address already opened instead of minting a second one', async () => {
    const existing = buildStellarEscrow();
    const harness = buildHarness({ stellarEscrow: existing });

    await expect(harness.service.openFunding(ESCROW_ID, BUYER_ID)).resolves.toBe(existing);
    expect(harness.openDepositAddress).not.toHaveBeenCalled();
  });

  it('lets only the buyer open the deposit', async () => {
    const harness = buildHarness();

    await expect(harness.service.openFunding(ESCROW_ID, SELLER_ID)).rejects.toThrow(
      OnlyBuyerMayActError,
    );
  });

  it('refuses an escrow that is not yet agreed', async () => {
    const harness = buildHarness({ escrowState: EscrowState.DRAFT });

    await expect(harness.service.openFunding(ESCROW_ID, BUYER_ID)).rejects.toThrow(
      StellarFundingUnavailableError,
    );
  });

  it('refuses a naira-priced escrow', async () => {
    const harness = buildHarness({ priceCurrency: 'NGN' });

    await expect(harness.service.openFunding(ESCROW_ID, BUYER_ID)).rejects.toThrow(
      UnsupportedStellarCurrencyError,
    );
  });
});

describe('StellarEscrowService.confirmDeposit', () => {
  it('posts the deposit to the ledger and moves the escrow to FUNDED in one transaction', async () => {
    const harness = buildHarness({
      stellarEscrow: buildStellarEscrow(),
      payment: buildPayment(),
    });

    const stellarEscrow = await harness.service.confirmDeposit(ESCROW_ID, BUYER_ID, TX_HASH);

    const lines = callArg<PostingLine[]>(harness.postTransaction, 0, 0);
    expect(lines).toEqual([
      {
        accountRef: providerClearingRef(STELLAR_LEDGER_PROVIDER, 'USD'),
        direction: EntryDirection.DEBIT,
        money: Money.of(PRICE_CENTS, 'USD'),
      },
      {
        accountRef: escrowHoldingRef(ESCROW_ID),
        direction: EntryDirection.CREDIT,
        money: Money.of(PRICE_CENTS, 'USD'),
      },
    ]);
    expect(callArg<{ idempotencyKey: string }>(harness.postTransaction, 0, 1).idempotencyKey).toBe(
      `stellar-fund:${TX_HASH}`,
    );
    expect(harness.transition).toHaveBeenCalledWith(
      ESCROW_ID,
      EscrowState.FUNDED,
      expect.objectContaining({ actorId: null }),
      expect.anything(),
    );
    expect(stellarEscrow.status).toBe(StellarEscrowStatus.FUNDED);
    expect(stellarEscrow.fundingTransactionHash).toBe(TX_HASH);
  });

  it('notifies both parties that the escrow is funded', async () => {
    const harness = buildHarness({
      stellarEscrow: buildStellarEscrow(),
      payment: buildPayment(),
    });

    await harness.service.confirmDeposit(ESCROW_ID, BUYER_ID, TX_HASH);

    expect(harness.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        escrowId: ESCROW_ID,
        eventType: NotificationEventType.FUNDED,
        recipientUserIds: [BUYER_ID, SELLER_ID],
      }),
    );
  });

  it('is a no-op when the same transaction hash is confirmed twice', async () => {
    const harness = buildHarness({
      stellarEscrow: buildStellarEscrow({
        status: StellarEscrowStatus.FUNDED,
        fundingTransactionHash: TX_HASH,
      }),
    });

    await harness.service.confirmDeposit(ESCROW_ID, BUYER_ID, TX_HASH);

    expect(harness.postTransaction).not.toHaveBeenCalled();
    expect(harness.transition).not.toHaveBeenCalled();
  });

  it('rejects a second, different transaction hash once the escrow is funded', async () => {
    const harness = buildHarness({
      stellarEscrow: buildStellarEscrow({
        status: StellarEscrowStatus.FUNDED,
        fundingTransactionHash: TX_HASH,
      }),
    });

    await expect(
      harness.service.confirmDeposit(ESCROW_ID, BUYER_ID, randomBytes(32).toString('hex')),
    ).rejects.toThrow(StellarDepositMismatchError);
  });

  it('rejects a transaction hash the network does not know', async () => {
    const harness = buildHarness({ stellarEscrow: buildStellarEscrow(), payment: null });

    await expect(harness.service.confirmDeposit(ESCROW_ID, BUYER_ID, TX_HASH)).rejects.toThrow(
      StellarDepositNotFoundError,
    );
    expect(harness.postTransaction).not.toHaveBeenCalled();
  });

  const mismatches: [string, Partial<StellarPayment>][] = [
    ['destination', { to: encodeStellarAccountId(randomBytes(32)) }],
    ['memo', { memo: 'someone-elses-escrow' }],
    ['asset', { asset: { code: 'XLM', issuer: ASSET.issuer } }],
    ['amount', { amount: '1.0000000' }],
  ];

  it.each(mismatches)('rejects a payment with the wrong %s', async (_label, overrides) => {
    const harness = buildHarness({
      stellarEscrow: buildStellarEscrow(),
      payment: buildPayment(overrides),
    });

    await expect(harness.service.confirmDeposit(ESCROW_ID, BUYER_ID, TX_HASH)).rejects.toThrow(
      StellarDepositMismatchError,
    );
    expect(harness.postTransaction).not.toHaveBeenCalled();
    expect(harness.transition).not.toHaveBeenCalled();
  });

  it('checks the caller is a party before touching the deposit', async () => {
    const harness = buildHarness({ stellarEscrow: buildStellarEscrow(), payment: buildPayment() });

    await harness.service.confirmDeposit(ESCROW_ID, BUYER_ID, TX_HASH);

    expect(harness.assertIsParty).toHaveBeenCalledWith(ESCROW_ID, BUYER_ID);
  });

  it('reports a missing deposit rather than a null row', async () => {
    const harness = buildHarness({ stellarEscrow: null });

    await expect(harness.service.confirmDeposit(ESCROW_ID, BUYER_ID, TX_HASH)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('StellarEscrowService.simulateDeposit', () => {
  it('mints a payment for the exact expected amount and funds the escrow', async () => {
    const harness = buildHarness({
      stellarEscrow: buildStellarEscrow(),
      payment: buildPayment(),
    });

    await harness.service.simulateDeposit(ESCROW_ID, BUYER_ID);

    expect(harness.receivePayment).toHaveBeenCalledWith(
      expect.objectContaining({ to: DEPOSIT_ACCOUNT, memo: MEMO, amount: '250.0000000' }),
    );
    expect(harness.transition).toHaveBeenCalledWith(
      ESCROW_ID,
      EscrowState.FUNDED,
      expect.anything(),
      expect.anything(),
    );
  });

  it('refuses to simulate against a network that is not simulated', async () => {
    const harness = buildHarness({ stellarEscrow: buildStellarEscrow(), simulated: false });

    await expect(harness.service.simulateDeposit(ESCROW_ID, BUYER_ID)).rejects.toThrow(
      StellarSimulationUnavailableError,
    );
  });
});
