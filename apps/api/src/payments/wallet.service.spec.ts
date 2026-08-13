import { Repository } from 'typeorm';
import { WalletService } from './wallet.service';
import { PayoutStatus } from './entities/payout-status.enum';
import { PaymentIntentStatus } from './entities/payment-intent-status.enum';
import { Payout } from '../database/entities/payout.entity';
import { PaymentIntent } from '../database/entities/payment-intent.entity';
import { AccountActivity, LedgerService } from '../ledger/ledger.service';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { escrowHoldingRef, userWalletRef } from '../ledger/account-refs';
import { EscrowService } from '../escrow/escrow.service';

const USER_ID = 'user-1';

function buildActivity(overrides: Partial<AccountActivity> = {}): AccountActivity {
  return {
    entryId: 'entry-1',
    direction: EntryDirection.CREDIT,
    amount: 10_000,
    currency: 'NGN',
    idempotencyKey: 'release:escrow-9',
    correlationId: null,
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

function buildPayout(overrides: Partial<Payout> = {}): Payout {
  return {
    id: 'payout-1',
    sellerId: USER_ID,
    amount: 5_000,
    currency: 'NGN',
    status: PayoutStatus.PENDING,
    ...overrides,
  } as Payout;
}

function buildIntent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: 'intent-1',
    escrowId: 'escrow-5',
    buyerId: USER_ID,
    amount: 20_000,
    currency: 'NGN',
    status: PaymentIntentStatus.FUNDED,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as PaymentIntent;
}

interface Harness {
  service: WalletService;
  getBalanceOrZero: jest.Mock;
  sumBalances: jest.Mock;
  listActivity: jest.Mock;
  payoutsFind: jest.Mock;
  intentsFind: jest.Mock;
  listEscrowIdsForUser: jest.Mock;
}

function buildHarness(
  options: {
    available?: { amount: number; currency: string };
    held?: { amount: number; currency: string };
    pendingPayouts?: Payout[];
    activity?: AccountActivity[];
    fundings?: PaymentIntent[];
    escrowIds?: string[];
  } = {},
): Harness {
  const payoutsFind = jest.fn().mockResolvedValue(options.pendingPayouts ?? []);
  const payouts = { find: payoutsFind } as unknown as Repository<Payout>;

  const intentsFind = jest.fn().mockResolvedValue(options.fundings ?? []);
  const intents = { find: intentsFind } as unknown as Repository<PaymentIntent>;

  const getBalanceOrZero = jest
    .fn()
    .mockResolvedValue(options.available ?? { amount: 75_000, currency: 'NGN' });
  const sumBalances = jest.fn().mockResolvedValue(options.held ?? { amount: 30_000, currency: 'NGN' });
  const listActivity = jest.fn().mockResolvedValue(options.activity ?? []);
  const ledgerService = {
    getBalanceOrZero,
    sumBalances,
    listActivity,
  } as unknown as LedgerService;

  const listEscrowIdsForUser = jest.fn().mockResolvedValue(options.escrowIds ?? ['escrow-5']);
  const escrowService = { listEscrowIdsForUser } as unknown as EscrowService;

  return {
    service: new WalletService(payouts, intents, ledgerService, escrowService),
    getBalanceOrZero,
    sumBalances,
    listActivity,
    payoutsFind,
    intentsFind,
    listEscrowIdsForUser,
  };
}

describe('WalletService.getBalances', () => {
  it('reads the available balance from the user wallet account', async () => {
    const harness = buildHarness();

    const balances = await harness.service.getBalances(USER_ID);

    expect(harness.getBalanceOrZero).toHaveBeenCalledWith(userWalletRef(USER_ID), 'NGN');
    expect(balances.available).toEqual({ amount: 75_000, currency: 'NGN' });
  });

  it('sums held funds across every escrow the user is party to', async () => {
    const harness = buildHarness({ escrowIds: ['escrow-1', 'escrow-2'] });

    const balances = await harness.service.getBalances(USER_ID);

    expect(harness.sumBalances).toHaveBeenCalledWith(
      [escrowHoldingRef('escrow-1'), escrowHoldingRef('escrow-2')],
      'NGN',
    );
    expect(balances.heldInEscrow).toEqual({ amount: 30_000, currency: 'NGN' });
  });

  it('reports zero pending when the user has no payouts in flight', async () => {
    const harness = buildHarness({ pendingPayouts: [] });

    const balances = await harness.service.getBalances(USER_ID);

    expect(balances.pending).toEqual({ amount: 0, currency: 'NGN' });
  });

  it('adds up every pending payout into the pending balance', async () => {
    const harness = buildHarness({
      pendingPayouts: [buildPayout({ amount: 5_000 }), buildPayout({ id: 'p2', amount: 7_500 })],
    });

    const balances = await harness.service.getBalances(USER_ID);

    expect(balances.pending).toEqual({ amount: 12_500, currency: 'NGN' });
  });

  it('counts only pending payouts in the platform currency', async () => {
    const harness = buildHarness();

    await harness.service.getBalances(USER_ID);

    expect(harness.payoutsFind).toHaveBeenCalledWith({
      where: { sellerId: USER_ID, status: PayoutStatus.PENDING, currency: 'NGN' },
    });
  });
});

describe('WalletService.listActivity', () => {
  it('labels an escrow release and exposes the escrow it came from', async () => {
    const harness = buildHarness({
      activity: [buildActivity({ idempotencyKey: 'release:escrow-9' })],
    });

    const [item] = await harness.service.listActivity(USER_ID);

    expect(item).toEqual(
      expect.objectContaining({
        kind: 'ESCROW_RELEASE',
        direction: 'IN',
        escrowId: 'escrow-9',
        amount: { amount: 10_000, currency: 'NGN' },
      }),
    );
  });

  it('labels an escrow refund and exposes the escrow it came from', async () => {
    const harness = buildHarness({
      activity: [buildActivity({ idempotencyKey: 'refund:escrow-3' })],
    });

    const [item] = await harness.service.listActivity(USER_ID);

    expect(item.kind).toBe('ESCROW_REFUND');
    expect(item.escrowId).toBe('escrow-3');
  });

  it('labels a dispute resolution without attributing an escrow id', async () => {
    const harness = buildHarness({
      activity: [buildActivity({ idempotencyKey: 'dispute-resolve:dispute-2' })],
    });

    const [item] = await harness.service.listActivity(USER_ID);

    expect(item.kind).toBe('DISPUTE_RESOLUTION');
    expect(item.escrowId).toBeNull();
  });

  it('distinguishes a payout reversal from a payout', async () => {
    const harness = buildHarness({
      activity: [
        buildActivity({ entryId: 'e1', idempotencyKey: 'payout-reversal:payout-1' }),
        buildActivity({ entryId: 'e2', idempotencyKey: 'payout:payout-1' }),
      ],
    });

    const items = await harness.service.listActivity(USER_ID);

    expect(items.map((item) => item.kind)).toEqual(['PAYOUT_REVERSAL', 'PAYOUT']);
  });

  it('falls back to OTHER for an unrecognised posting key', async () => {
    const harness = buildHarness({
      activity: [buildActivity({ idempotencyKey: 'manual-adjustment:1' })],
    });

    const [item] = await harness.service.listActivity(USER_ID);

    expect(item.kind).toBe('OTHER');
    expect(item.escrowId).toBeNull();
  });

  it('reads a debit as money leaving the wallet', async () => {
    const harness = buildHarness({
      activity: [buildActivity({ direction: EntryDirection.DEBIT })],
    });

    const [item] = await harness.service.listActivity(USER_ID);

    expect(item.direction).toBe('OUT');
  });

  it('shows escrow funding the user paid for as money going out', async () => {
    const harness = buildHarness({ fundings: [buildIntent()] });

    const [item] = await harness.service.listActivity(USER_ID);

    expect(item).toEqual(
      expect.objectContaining({
        kind: 'ESCROW_FUNDING',
        direction: 'OUT',
        escrowId: 'escrow-5',
        amount: { amount: 20_000, currency: 'NGN' },
      }),
    );
  });

  it('counts only funded intents the user paid for', async () => {
    const harness = buildHarness();

    await harness.service.listActivity(USER_ID);

    expect(harness.intentsFind).toHaveBeenCalledWith({
      where: { buyerId: USER_ID, status: PaymentIntentStatus.FUNDED },
      order: { updatedAt: 'DESC' },
      take: 20,
    });
  });

  it('merges ledger entries and fundings into one newest-first feed', async () => {
    const harness = buildHarness({
      activity: [
        buildActivity({ entryId: 'older', createdAt: new Date('2025-12-01T00:00:00.000Z') }),
        buildActivity({ entryId: 'newest', createdAt: new Date('2026-03-01T00:00:00.000Z') }),
      ],
      fundings: [buildIntent({ id: 'middle', updatedAt: new Date('2026-01-15T00:00:00.000Z') })],
    });

    const items = await harness.service.listActivity(USER_ID);

    expect(items.map((item) => item.id)).toEqual(['newest', 'middle', 'older']);
  });

  it('caps the feed at twenty items', async () => {
    const harness = buildHarness({
      activity: Array.from({ length: 15 }, (_unused, index) =>
        buildActivity({ entryId: `entry-${index}` }),
      ),
      fundings: Array.from({ length: 15 }, (_unused, index) =>
        buildIntent({ id: `intent-${index}` }),
      ),
    });

    const items = await harness.service.listActivity(USER_ID);

    expect(items).toHaveLength(20);
  });
});
