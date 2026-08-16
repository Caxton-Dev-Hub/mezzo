import { DataSource, EntityManager, Repository } from 'typeorm';
import { PayoutService } from './payout.service';
import { PayoutStatus } from './entities/payout-status.enum';
import { Payout } from '../database/entities/payout.entity';
import { InsufficientWalletBalanceError } from './errors/insufficient-wallet-balance.error';
import { PayoutNotFailedError } from './errors/payout-not-failed.error';
import { PaymentProvider } from './providers/payment-provider.interface';
import { PaymentWebhookEventInput } from './webhook-event';
import { LedgerService, PostingLine } from '../ledger/ledger.service';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { providerClearingRef, userWalletRef } from '../ledger/account-refs';
import { KycService } from '../kyc/kyc.service';
import { KycTier } from '../kyc/entities/kyc-tier.enum';
import { Money } from '../common/money/money';
import { callArg } from '../../test/support/mock-calls';

const SELLER_ID = 'seller-1';
const PAYOUT_ID = 'payout-1';

function buildPayout(overrides: Partial<Payout> = {}): Payout {
  return {
    id: PAYOUT_ID,
    sellerId: SELLER_ID,
    amount: 50_000,
    currency: 'NGN',
    bankAccountNumber: '0123456789',
    bankCode: '058',
    provider: 'paystack',
    providerReference: 'ref-1',
    idempotencyKey: 'key-1',
    status: PayoutStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Payout;
}

function transferEvent(overrides: Partial<PaymentWebhookEventInput> = {}): PaymentWebhookEventInput {
  return {
    provider: 'paystack',
    eventId: 'evt-1',
    kind: 'transfer',
    reference: 'ref-1',
    amount: 50_000,
    currency: 'NGN',
    succeeded: true,
    ...overrides,
  };
}

interface Harness {
  service: PayoutService;
  payoutsFindOne: jest.Mock;
  payoutsFind: jest.Mock;
  payoutsSave: jest.Mock;
  managerSave: jest.Mock;
  getBalance: jest.Mock;
  postTransaction: jest.Mock;
  requireTier: jest.Mock;
  initiateTransfer: jest.Mock;
}

function buildHarness(
  options: {
    existing?: Payout | null;
    balance?: Money;
    payouts?: Payout[];
  } = {},
): Harness {
  const payoutsFindOne = jest.fn().mockResolvedValue(options.existing ?? null);
  const payoutsFind = jest.fn().mockResolvedValue(options.payouts ?? []);
  const payoutsSave = jest.fn().mockResolvedValue(undefined);
  const payouts = {
    findOne: payoutsFindOne,
    find: payoutsFind,
    save: payoutsSave,
  } as unknown as Repository<Payout>;

  const managerSave = jest
    .fn()
    .mockImplementation((_entity, row) => Promise.resolve({ ...row, id: PAYOUT_ID, createdAt: new Date() }));
  const manager = {
    save: managerSave,
    create: (_entity: unknown, row: Record<string, unknown>) => row,
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn().mockImplementation((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
  } as unknown as DataSource;

  const getBalance = jest
    .fn()
    .mockResolvedValue(options.balance ?? Money.of(100_000, 'NGN'));
  const postTransaction = jest.fn().mockResolvedValue(undefined);
  const ledgerService = { getBalance, postTransaction } as unknown as LedgerService;

  const requireTier = jest.fn().mockResolvedValue(undefined);
  const kycService = { requireTier } as unknown as KycService;

  const initiateTransfer = jest.fn().mockResolvedValue(undefined);
  const paymentProvider = {
    name: 'paystack',
    initiateTransfer,
    initializeTransaction: jest.fn(),
  } as unknown as PaymentProvider;

  const service = new PayoutService(payouts, dataSource, ledgerService, kycService, paymentProvider);

  return {
    service,
    payoutsFindOne,
    payoutsFind,
    payoutsSave,
    managerSave,
    getBalance,
    postTransaction,
    requireTier,
    initiateTransfer,
  };
}

const dto = {
  amount: { amount: 50_000, currency: 'NGN' as const },
  bankAccountNumber: '0123456789',
  bankCode: '058',
  idempotencyKey: 'key-1',
};

describe('PayoutService.requestPayout', () => {
  it('requires the seller to hold at least tier 1 before any money moves', async () => {
    const harness = buildHarness();
    harness.requireTier.mockRejectedValue(new Error('tier too low'));

    await expect(harness.service.requestPayout(SELLER_ID, dto)).rejects.toThrow('tier too low');
    expect(harness.initiateTransfer).not.toHaveBeenCalled();
    expect(harness.postTransaction).not.toHaveBeenCalled();
  });

  it('checks the tier requirement against TIER_1', async () => {
    const harness = buildHarness();

    await harness.service.requestPayout(SELLER_ID, dto);

    expect(harness.requireTier).toHaveBeenCalledWith(SELLER_ID, KycTier.TIER_1);
  });

  it('replays an existing payout for a repeated idempotency key without transferring again', async () => {
    const harness = buildHarness({ existing: buildPayout() });

    const response = await harness.service.requestPayout(SELLER_ID, dto);

    expect(response.id).toBe(PAYOUT_ID);
    expect(harness.initiateTransfer).not.toHaveBeenCalled();
    expect(harness.postTransaction).not.toHaveBeenCalled();
  });

  it('refuses a payout larger than the wallet balance', async () => {
    const harness = buildHarness({ balance: Money.of(49_999, 'NGN') });

    await expect(harness.service.requestPayout(SELLER_ID, dto)).rejects.toBeInstanceOf(
      InsufficientWalletBalanceError,
    );
    expect(harness.initiateTransfer).not.toHaveBeenCalled();
  });

  it('refuses a payout in a currency the wallet does not hold', async () => {
    const harness = buildHarness({ balance: Money.of(100_000, 'USD') });

    await expect(harness.service.requestPayout(SELLER_ID, dto)).rejects.toBeInstanceOf(
      InsufficientWalletBalanceError,
    );
  });

  it('allows a payout that spends the balance down to exactly zero', async () => {
    const harness = buildHarness({ balance: Money.of(50_000, 'NGN') });

    await expect(harness.service.requestPayout(SELLER_ID, dto)).resolves.toEqual(
      expect.objectContaining({ status: PayoutStatus.PENDING }),
    );
  });

  it('asks the provider to transfer to the supplied bank account', async () => {
    const harness = buildHarness();

    await harness.service.requestPayout(SELLER_ID, dto);

    expect(harness.initiateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amountKobo: 50_000,
        currency: 'NGN',
        accountNumber: '0123456789',
        bankCode: '058',
      }),
    );
  });

  it('debits the seller wallet into provider clearing in one balanced posting', async () => {
    const harness = buildHarness();

    await harness.service.requestPayout(SELLER_ID, dto);

    const lines = callArg<PostingLine[]>(harness.postTransaction, 0, 0);
    expect(lines).toEqual([
      expect.objectContaining({
        accountRef: userWalletRef(SELLER_ID),
        direction: EntryDirection.DEBIT,
        money: expect.objectContaining({ amount: 50_000, currency: 'NGN' }) as Money,
      }),
      expect.objectContaining({
        accountRef: providerClearingRef('paystack'),
        direction: EntryDirection.CREDIT,
        money: expect.objectContaining({ amount: 50_000, currency: 'NGN' }) as Money,
      }),
    ]);
  });

  it('keys the posting to the payout row so a retry cannot double-debit', async () => {
    const harness = buildHarness();

    await harness.service.requestPayout(SELLER_ID, dto);

    expect(callArg(harness.postTransaction, 0, 1)).toEqual(
      expect.objectContaining({ idempotencyKey: `payout:${PAYOUT_ID}` }),
    );
  });

  it('stores the payout as pending with the caller idempotency key', async () => {
    const harness = buildHarness();

    await harness.service.requestPayout(SELLER_ID, dto);

    expect(harness.managerSave).toHaveBeenCalledWith(
      Payout,
      expect.objectContaining({
        sellerId: SELLER_ID,
        amount: 50_000,
        currency: 'NGN',
        idempotencyKey: 'key-1',
        status: PayoutStatus.PENDING,
      }),
    );
  });
});

describe('PayoutService.listPayouts', () => {
  it('returns the seller most recent payouts', async () => {
    const harness = buildHarness({ payouts: [buildPayout()] });

    const response = await harness.service.listPayouts(SELLER_ID);

    expect(harness.payoutsFind).toHaveBeenCalledWith({
      where: { sellerId: SELLER_ID },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    expect(response).toEqual([expect.objectContaining({ id: PAYOUT_ID, amount: 50_000 })]);
  });
});

describe('PayoutService.handleTransferWebhook', () => {
  it('ignores a transfer that matches no payout', async () => {
    const harness = buildHarness({ existing: null });

    await harness.service.handleTransferWebhook(transferEvent());

    expect(harness.payoutsSave).not.toHaveBeenCalled();
    expect(harness.postTransaction).not.toHaveBeenCalled();
  });

  it('ignores a replayed webhook for an already-confirmed payout', async () => {
    const harness = buildHarness({ existing: buildPayout({ status: PayoutStatus.CONFIRMED }) });

    await harness.service.handleTransferWebhook(transferEvent());

    expect(harness.payoutsSave).not.toHaveBeenCalled();
    expect(harness.postTransaction).not.toHaveBeenCalled();
  });

  it('confirms a successful transfer without moving money again', async () => {
    const payout = buildPayout();
    const harness = buildHarness({ existing: payout });

    await harness.service.handleTransferWebhook(transferEvent());

    expect(payout.status).toBe(PayoutStatus.CONFIRMED);
    expect(harness.payoutsSave).toHaveBeenCalledWith(payout);
    expect(harness.postTransaction).not.toHaveBeenCalled();
  });

  it('returns the money to the seller wallet when the transfer fails', async () => {
    const payout = buildPayout();
    const harness = buildHarness({ existing: payout });

    await harness.service.handleTransferWebhook(transferEvent({ succeeded: false }));

    const lines = callArg<PostingLine[]>(harness.postTransaction, 0, 0);
    expect(lines).toEqual([
      expect.objectContaining({
        accountRef: providerClearingRef('paystack'),
        direction: EntryDirection.DEBIT,
        money: expect.objectContaining({ amount: 50_000 }) as Money,
      }),
      expect.objectContaining({
        accountRef: userWalletRef(SELLER_ID),
        direction: EntryDirection.CREDIT,
        money: expect.objectContaining({ amount: 50_000 }) as Money,
      }),
    ]);
    expect(payout.status).toBe(PayoutStatus.FAILED);
  });

  it('keys the reversal to the payout so a replay cannot double-refund the wallet', async () => {
    const harness = buildHarness({ existing: buildPayout() });

    await harness.service.handleTransferWebhook(transferEvent({ succeeded: false }));

    expect(callArg(harness.postTransaction, 0, 1)).toEqual(
      expect.objectContaining({ idempotencyKey: `payout-reversal:${PAYOUT_ID}` }),
    );
  });

  it('marks the payout failed inside the same transaction as the reversal', async () => {
    const payout = buildPayout();
    const harness = buildHarness({ existing: payout });

    await harness.service.handleTransferWebhook(transferEvent({ succeeded: false }));

    expect(harness.managerSave).toHaveBeenCalledWith(Payout, payout);
  });
});

describe('PayoutService.retryPayout', () => {
  it('re-attempts a transfer using the failed payout\'s original details', async () => {
    const harness = buildHarness();
    harness.payoutsFindOne
      .mockResolvedValueOnce(buildPayout({ status: PayoutStatus.FAILED }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildPayout({ status: PayoutStatus.PENDING }));

    const result = await harness.service.retryPayout(PAYOUT_ID);

    expect(harness.initiateTransfer).toHaveBeenCalledTimes(1);
    expect(harness.initiateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amountKobo: 50_000,
        accountNumber: '0123456789',
        bankCode: '058',
      }),
    );
    expect(result.status).toBe(PayoutStatus.PENDING);
  });

  it('refuses to retry a payout that has not failed', async () => {
    const harness = buildHarness({ existing: buildPayout({ status: PayoutStatus.PENDING }) });

    await expect(harness.service.retryPayout(PAYOUT_ID)).rejects.toThrow(PayoutNotFailedError);
    expect(harness.initiateTransfer).not.toHaveBeenCalled();
  });

  it('refuses to retry a payout that does not exist', async () => {
    const harness = buildHarness({ existing: null });

    await expect(harness.service.retryPayout(PAYOUT_ID)).rejects.toThrow(PayoutNotFailedError);
  });
});
