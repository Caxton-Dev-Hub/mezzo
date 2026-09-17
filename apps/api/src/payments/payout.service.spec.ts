import { DataSource, EntityManager, Repository } from 'typeorm';
import { PayoutService } from './payout.service';
import { PayoutStatus } from './entities/payout-status.enum';
import { Payout } from '../database/entities/payout.entity';
import { PayoutAccount } from '../database/entities/payout-account.entity';
import { InsufficientWalletBalanceError } from './errors/insufficient-wallet-balance.error';
import { PayoutNotFailedError } from './errors/payout-not-failed.error';
import { PayoutAccountNotConfiguredError } from './errors/payout-account-not-configured.error';
import { PayoutAccountVerificationMismatchError } from './errors/payout-account-verification-mismatch.error';
import { UnknownBankError } from './errors/unknown-bank.error';
import { Bank, PaymentProvider } from './providers/payment-provider.interface';
import { PaymentWebhookEventInput } from './webhook-event';
import { LedgerService, PostingLine } from '../ledger/ledger.service';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { providerClearingRef, userWalletRef } from '../ledger/account-refs';
import { KycService } from '../kyc/kyc.service';
import { KycTier } from '../kyc/entities/kyc-tier.enum';
import { Money } from '../common/money/money';
import { Currency } from '../common/money/currency';
import { callArg } from '../../test/support/mock-calls';

const SELLER_ID = 'seller-1';
const PAYOUT_ID = 'payout-1';

const BANKS: Bank[] = [
  { code: '058', name: 'GTBank' },
  { code: '011', name: 'First Bank of Nigeria' },
];

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

function buildPayoutAccount(overrides: Partial<PayoutAccount> = {}): PayoutAccount {
  return {
    id: 'payout-account-1',
    userId: SELLER_ID,
    bankCode: '058',
    bankName: 'GTBank',
    accountNumber: '0123456789',
    accountName: 'Jane Doe',
    provider: 'paystack',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PayoutAccount;
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
  payoutAccountsFindOne: jest.Mock;
  payoutAccountsSave: jest.Mock;
  payoutAccountsCreate: jest.Mock;
  managerSave: jest.Mock;
  getBalance: jest.Mock;
  postTransaction: jest.Mock;
  requireTier: jest.Mock;
  initiateTransfer: jest.Mock;
  resolveAccount: jest.Mock;
  listBanks: jest.Mock;
}

function buildHarness(
  options: {
    existing?: Payout | null;
    balance?: Money;
    payouts?: Payout[];
    payoutAccount?: PayoutAccount | null;
    resolvedAccountName?: string;
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

  const savedPayoutAccount =
    options.payoutAccount === undefined ? buildPayoutAccount() : options.payoutAccount;
  const payoutAccountsFindOne = jest.fn().mockResolvedValue(savedPayoutAccount);
  const payoutAccountsSave = jest
    .fn()
    .mockImplementation((account: PayoutAccount) => Promise.resolve(account));
  const payoutAccountsCreate = jest
    .fn()
    .mockImplementation((row: Partial<PayoutAccount>) => ({ ...row }) as PayoutAccount);
  const payoutAccounts = {
    findOne: payoutAccountsFindOne,
    save: payoutAccountsSave,
    create: payoutAccountsCreate,
  } as unknown as Repository<PayoutAccount>;

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

  const walletBalance = options.balance ?? Money.of(100_000, 'NGN');
  const getBalance = jest.fn().mockResolvedValue(walletBalance);
  const getBalanceOrZero = jest
    .fn()
    .mockImplementation((_ref: string, currency: Currency) =>
      Promise.resolve(
        walletBalance.currency === currency
          ? { amount: walletBalance.amount, currency }
          : { amount: 0, currency },
      ),
    );
  const postTransaction = jest.fn().mockResolvedValue(undefined);
  const ledgerService = {
    getBalance,
    getBalanceOrZero,
    postTransaction,
  } as unknown as LedgerService;

  const requireTier = jest.fn().mockResolvedValue(undefined);
  const kycService = { requireTier } as unknown as KycService;

  const initiateTransfer = jest.fn().mockResolvedValue(undefined);
  const resolveAccount = jest.fn().mockResolvedValue({
    accountName: options.resolvedAccountName ?? savedPayoutAccount?.accountName ?? 'Jane Doe',
  });
  const listBanks = jest.fn().mockResolvedValue(BANKS);
  const paymentProvider = {
    name: 'paystack',
    initiateTransfer,
    initializeTransaction: jest.fn(),
    resolveAccount,
    listBanks,
  } as unknown as PaymentProvider;

  const service = new PayoutService(
    payouts,
    payoutAccounts,
    dataSource,
    ledgerService,
    kycService,
    paymentProvider,
  );

  return {
    service,
    payoutsFindOne,
    payoutsFind,
    payoutsSave,
    payoutAccountsFindOne,
    payoutAccountsSave,
    payoutAccountsCreate,
    managerSave,
    getBalance,
    postTransaction,
    requireTier,
    initiateTransfer,
    resolveAccount,
    listBanks,
  };
}

const dto = {
  amount: { amount: 50_000, currency: 'NGN' as const },
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

  it('refuses a payout when the seller has not saved a payout account', async () => {
    const harness = buildHarness({ payoutAccount: null });

    await expect(harness.service.requestPayout(SELLER_ID, dto)).rejects.toBeInstanceOf(
      PayoutAccountNotConfiguredError,
    );
    expect(harness.initiateTransfer).not.toHaveBeenCalled();
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

  it('re-verifies the saved account name against the bank before transferring', async () => {
    const harness = buildHarness();

    await harness.service.requestPayout(SELLER_ID, dto);

    expect(harness.resolveAccount).toHaveBeenCalledWith({
      accountNumber: '0123456789',
      bankCode: '058',
    });
  });

  it('refuses to transfer when the bank no longer resolves the saved account to the same name', async () => {
    const harness = buildHarness({ resolvedAccountName: 'Someone Else' });

    await expect(harness.service.requestPayout(SELLER_ID, dto)).rejects.toBeInstanceOf(
      PayoutAccountVerificationMismatchError,
    );
    expect(harness.initiateTransfer).not.toHaveBeenCalled();
  });

  it('tolerates whitespace and case differences when matching the resolved account name', async () => {
    const harness = buildHarness({
      payoutAccount: buildPayoutAccount({ accountName: 'Jane   Doe' }),
      resolvedAccountName: 'jane doe',
    });

    await expect(harness.service.requestPayout(SELLER_ID, dto)).resolves.toEqual(
      expect.objectContaining({ status: PayoutStatus.PENDING }),
    );
  });

  it('asks the provider to transfer to the saved bank account', async () => {
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
        accountRef: userWalletRef(SELLER_ID, 'NGN'),
        direction: EntryDirection.DEBIT,
        money: expect.objectContaining({ amount: 50_000, currency: 'NGN' }) as Money,
      }),
      expect.objectContaining({
        accountRef: providerClearingRef('paystack', 'NGN'),
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

describe('PayoutService.listBanks', () => {
  it('returns the bank list from the active provider sorted by name', async () => {
    const harness = buildHarness();

    await expect(harness.service.listBanks()).resolves.toEqual([
      { code: '011', name: 'First Bank of Nigeria' },
      { code: '058', name: 'GTBank' },
    ]);
  });

  it('sorts case-insensitively so a lowercase name is not pushed to the end', async () => {
    const harness = buildHarness();
    harness.listBanks.mockResolvedValue([
      { code: '050', name: 'zenith microfinance' },
      { code: '058', name: 'GTBank' },
      { code: '044', name: 'Access Bank' },
    ]);

    const banks = await harness.service.listBanks();

    expect(banks.map((bank) => bank.name)).toEqual([
      'Access Bank',
      'GTBank',
      'zenith microfinance',
    ]);
  });
});

describe('PayoutService.verifyAccount', () => {
  it('resolves the account name from the active provider without saving anything', async () => {
    const harness = buildHarness();

    const result = await harness.service.verifyAccount({
      bankCode: '058',
      accountNumber: '0123456789',
    });

    expect(result).toEqual({ accountName: 'Jane Doe' });
    expect(harness.payoutAccountsSave).not.toHaveBeenCalled();
  });
});

describe('PayoutService.savePayoutAccount', () => {
  it('requires at least tier 1 before saving a payout account', async () => {
    const harness = buildHarness();
    harness.requireTier.mockRejectedValue(new Error('tier too low'));

    await expect(
      harness.service.savePayoutAccount(SELLER_ID, { bankCode: '058', accountNumber: '0123456789' }),
    ).rejects.toThrow('tier too low');
  });

  it('rejects a bank code that is not in the provider bank list', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.savePayoutAccount(SELLER_ID, { bankCode: '999', accountNumber: '0123456789' }),
    ).rejects.toBeInstanceOf(UnknownBankError);
    expect(harness.resolveAccount).not.toHaveBeenCalled();
  });

  it('resolves the account name from the provider rather than trusting client input', async () => {
    const harness = buildHarness({ payoutAccount: null });

    const result = await harness.service.savePayoutAccount(SELLER_ID, {
      bankCode: '058',
      accountNumber: '0123456789',
    });

    expect(harness.resolveAccount).toHaveBeenCalledWith({
      bankCode: '058',
      accountNumber: '0123456789',
    });
    expect(result).toEqual(
      expect.objectContaining({
        bankCode: '058',
        bankName: 'GTBank',
        accountNumber: '0123456789',
        accountName: 'Jane Doe',
      }),
    );
  });

  it('overwrites an existing saved payout account rather than creating a second one', async () => {
    const existing = buildPayoutAccount({ bankCode: '011', accountNumber: '9999999999' });
    const harness = buildHarness({ payoutAccount: existing, resolvedAccountName: 'Jane Doe' });

    await harness.service.savePayoutAccount(SELLER_ID, {
      bankCode: '058',
      accountNumber: '0123456789',
    });

    expect(harness.payoutAccountsCreate).not.toHaveBeenCalled();
    expect(harness.payoutAccountsSave).toHaveBeenCalledWith(
      expect.objectContaining({ bankCode: '058', accountNumber: '0123456789' }),
    );
  });
});

describe('PayoutService.getPayoutAccount', () => {
  it('returns null when the seller has not saved a payout account', async () => {
    const harness = buildHarness({ payoutAccount: null });

    await expect(harness.service.getPayoutAccount(SELLER_ID)).resolves.toBeNull();
  });

  it('returns the saved payout account', async () => {
    const harness = buildHarness({ payoutAccount: buildPayoutAccount() });

    await expect(harness.service.getPayoutAccount(SELLER_ID)).resolves.toEqual(
      expect.objectContaining({ bankCode: '058', accountNumber: '0123456789' }),
    );
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
        accountRef: providerClearingRef('paystack', 'NGN'),
        direction: EntryDirection.DEBIT,
        money: expect.objectContaining({ amount: 50_000 }) as Money,
      }),
      expect.objectContaining({
        accountRef: userWalletRef(SELLER_ID, 'NGN'),
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
  it("re-attempts a transfer using the seller's currently saved payout account", async () => {
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
