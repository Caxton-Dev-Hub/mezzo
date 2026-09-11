import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { LedgerService } from './ledger.service';
import { EntryDirection } from './entities/entry-direction.enum';
import { userWalletRef } from './account-refs';
import { LedgerAccount } from '../database/entities/ledger-account.entity';
import { LedgerPosting } from '../database/entities/ledger-posting.entity';
import { LedgerEntry } from '../database/entities/ledger-entry.entity';
import { Money } from '../common/money/money';

const ACCOUNT_ID = 'account-1';
const REF = userWalletRef('user-1', 'NGN');

function buildAccount(overrides: Partial<LedgerAccount> = {}): LedgerAccount {
  return {
    id: ACCOUNT_ID,
    ref: REF,
    currency: 'NGN',
    normalBalance: EntryDirection.CREDIT,
    cachedBalance: 10_000,
    cachedAt: new Date(),
    ...overrides,
  } as LedgerAccount;
}

interface Harness {
  service: LedgerService;
  accountsFindOne: jest.Mock;
  accountsUpdate: jest.Mock;
  entriesFind: jest.Mock;
  postingsFind: jest.Mock;
  rawRows: jest.Mock;
  limitSpy: jest.Mock;
}

function buildHarness(
  options: {
    account?: LedgerAccount | null;
    totals?: { direction: EntryDirection; total: string }[];
    activityRows?: Record<string, unknown>[];
    existingPosting?: LedgerPosting | null;
  } = {},
): Harness {
  const accountsFindOne = jest
    .fn()
    .mockResolvedValue(options.account === undefined ? buildAccount() : options.account);
  const accountsUpdate = jest.fn().mockResolvedValue({ affected: 1 });
  const accounts = {
    findOne: accountsFindOne,
    update: accountsUpdate,
  } as unknown as Repository<LedgerAccount>;

  const postingsFind = jest.fn().mockResolvedValue([]);
  const postingsFindOne = jest.fn().mockResolvedValue(options.existingPosting ?? null);
  const postings = {
    find: postingsFind,
    findOne: postingsFindOne,
  } as unknown as Repository<LedgerPosting>;

  const entriesFind = jest.fn().mockResolvedValue([]);
  const rawRows = jest
    .fn()
    .mockResolvedValue(options.activityRows ?? options.totals ?? []);
  const limitSpy = jest.fn();
  const builder = {
    innerJoin: () => builder,
    select: () => builder,
    addSelect: () => builder,
    where: () => builder,
    andWhere: () => builder,
    groupBy: () => builder,
    addGroupBy: () => builder,
    orderBy: () => builder,
    limit: (value: number) => {
      limitSpy(value);
      return builder;
    },
    getRawMany: rawRows,
  };
  const entries = {
    find: entriesFind,
    createQueryBuilder: () => builder,
  } as unknown as Repository<LedgerEntry>;

  const dataSource = {
    transaction: jest.fn().mockImplementation((cb: (m: EntityManager) => Promise<unknown>) => cb({} as EntityManager)),
  } as unknown as DataSource;

  return {
    service: new LedgerService(accounts, postings, entries, dataSource),
    accountsFindOne,
    accountsUpdate,
    entriesFind,
    postingsFind,
    rawRows,
    limitSpy,
  };
}

describe('LedgerService.computeDerivedBalance', () => {
  it('nets credits against debits for a credit-normal account', async () => {
    const harness = buildHarness({
      totals: [
        { direction: EntryDirection.CREDIT, total: '100000' },
        { direction: EntryDirection.DEBIT, total: '40000' },
      ],
    });

    await expect(
      harness.service.computeDerivedBalance(ACCOUNT_ID, EntryDirection.CREDIT),
    ).resolves.toBe(60_000);
  });

  it('nets debits against credits for a debit-normal account', async () => {
    const harness = buildHarness({
      totals: [
        { direction: EntryDirection.CREDIT, total: '100000' },
        { direction: EntryDirection.DEBIT, total: '40000' },
      ],
    });

    await expect(
      harness.service.computeDerivedBalance(ACCOUNT_ID, EntryDirection.DEBIT),
    ).resolves.toBe(-60_000);
  });

  it('treats an account with no entries as zero', async () => {
    const harness = buildHarness({ totals: [] });

    await expect(
      harness.service.computeDerivedBalance(ACCOUNT_ID, EntryDirection.CREDIT),
    ).resolves.toBe(0);
  });

  it('handles one-sided history without producing NaN', async () => {
    const harness = buildHarness({
      totals: [{ direction: EntryDirection.CREDIT, total: '25000' }],
    });

    await expect(
      harness.service.computeDerivedBalance(ACCOUNT_ID, EntryDirection.CREDIT),
    ).resolves.toBe(25_000);
  });
});

describe('LedgerService.getBalance', () => {
  it('throws NotFoundException for an account that does not exist', async () => {
    const harness = buildHarness({ account: null });

    await expect(harness.service.getBalance(REF)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the derived balance in the account currency', async () => {
    const harness = buildHarness({
      totals: [{ direction: EntryDirection.CREDIT, total: '75000' }],
    });

    await expect(harness.service.getBalance(REF)).resolves.toEqual({
      amount: 75_000,
      currency: 'NGN',
    });
  });
});

describe('LedgerService.getBalanceOrZero', () => {
  it('returns zero rather than throwing for an account that was never opened', async () => {
    const harness = buildHarness({ account: null });

    await expect(harness.service.getBalanceOrZero(REF, 'NGN')).resolves.toEqual({
      amount: 0,
      currency: 'NGN',
    });
  });

  it('returns zero when the account is held in another currency', async () => {
    const harness = buildHarness({ account: buildAccount({ currency: 'USD' }) });

    await expect(harness.service.getBalanceOrZero(REF, 'NGN')).resolves.toEqual({
      amount: 0,
      currency: 'NGN',
    });
  });

  it('returns the derived balance for a matching account', async () => {
    const harness = buildHarness({
      totals: [{ direction: EntryDirection.CREDIT, total: '5000' }],
    });

    await expect(harness.service.getBalanceOrZero(REF, 'NGN')).resolves.toEqual({
      amount: 5_000,
      currency: 'NGN',
    });
  });
});

describe('LedgerService.sumBalances', () => {
  it('short-circuits to zero for an empty ref list', async () => {
    const harness = buildHarness();

    await expect(harness.service.sumBalances([], 'NGN')).resolves.toEqual({
      amount: 0,
      currency: 'NGN',
    });
    expect(harness.rawRows).not.toHaveBeenCalled();
  });

  it('adds entries on the normal side and subtracts the contra side', async () => {
    const harness = buildHarness({
      activityRows: [
        { normalBalance: EntryDirection.DEBIT, direction: EntryDirection.DEBIT, total: '90000' },
        { normalBalance: EntryDirection.DEBIT, direction: EntryDirection.CREDIT, total: '30000' },
      ],
    });

    await expect(harness.service.sumBalances(['escrow:e1:holding'], 'NGN')).resolves.toEqual({
      amount: 60_000,
      currency: 'NGN',
    });
  });
});

describe('LedgerService.rebuildBalance', () => {
  it('throws NotFoundException for an unknown account', async () => {
    const harness = buildHarness({ account: null });

    await expect(harness.service.rebuildBalance(REF)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('writes the recomputed balance back into the cache', async () => {
    const harness = buildHarness({
      totals: [{ direction: EntryDirection.CREDIT, total: '42000' }],
    });

    const balance = await harness.service.rebuildBalance(REF);

    expect(balance).toEqual({ amount: 42_000, currency: 'NGN' });
    expect(harness.accountsUpdate).toHaveBeenCalledWith(ACCOUNT_ID, {
      cachedBalance: 42_000,
      cachedAt: expect.any(Date) as Date,
    });
  });
});

describe('LedgerService.listActivity', () => {
  it('returns nothing for an account that was never opened', async () => {
    const harness = buildHarness({ account: null });

    await expect(harness.service.listActivity(REF)).resolves.toEqual([]);
  });

  it('converts the raw amount back to an integer minor unit', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const harness = buildHarness({
      activityRows: [
        {
          entryId: 'entry-1',
          direction: EntryDirection.CREDIT,
          amount: '97500',
          currency: 'NGN',
          idempotencyKey: 'release:escrow-1',
          correlationId: 'corr-1',
          createdAt,
        },
      ],
    });

    await expect(harness.service.listActivity(REF)).resolves.toEqual([
      {
        entryId: 'entry-1',
        direction: EntryDirection.CREDIT,
        amount: 97_500,
        currency: 'NGN',
        idempotencyKey: 'release:escrow-1',
        correlationId: 'corr-1',
        createdAt,
      },
    ]);
  });

  it('defaults to twenty rows and honours an explicit limit', async () => {
    const harness = buildHarness({ activityRows: [] });

    await harness.service.listActivity(REF);
    expect(harness.limitSpy).toHaveBeenCalledWith(20);

    await harness.service.listActivity(REF, 5);
    expect(harness.limitSpy).toHaveBeenCalledWith(5);
  });
});

describe('LedgerService posting lookups', () => {
  it('lists the postings of a correlation id oldest first', async () => {
    const harness = buildHarness();

    await harness.service.listPostingsByCorrelationId('corr-1');

    expect(harness.postingsFind).toHaveBeenCalledWith({
      where: { correlationId: 'corr-1' },
      order: { createdAt: 'ASC' },
    });
  });

  it('lists the entries of a posting oldest first', async () => {
    const harness = buildHarness();

    await harness.service.listEntriesForPosting('posting-1');

    expect(harness.entriesFind).toHaveBeenCalledWith({
      where: { postingId: 'posting-1' },
      order: { createdAt: 'ASC' },
    });
  });

  it('throws NotFoundException when listing entries for an unknown account ref', async () => {
    const harness = buildHarness({ account: null });

    await expect(harness.service.listEntriesByAccountRef(REF)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists account entries newest first and caps the page', async () => {
    const harness = buildHarness();

    await harness.service.listEntriesByAccountRef(REF, 10);

    expect(harness.entriesFind).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT_ID },
      order: { createdAt: 'DESC' },
      take: 10,
    });
  });
});

describe('LedgerService.postTransaction idempotency', () => {
  it('returns the existing posting for a repeated idempotency key without re-posting', async () => {
    const existing = { id: 'posting-1' } as LedgerPosting;
    const harness = buildHarness({ existingPosting: existing });

    const result = await harness.service.postTransaction(
      [
        { accountRef: REF, direction: EntryDirection.DEBIT, money: Money.of(100, 'NGN') },
        { accountRef: 'platform:fee-revenue', direction: EntryDirection.CREDIT, money: Money.of(100, 'NGN') },
      ],
      { idempotencyKey: 'key-1' },
    );

    expect(result).toBe(existing);
  });
});
