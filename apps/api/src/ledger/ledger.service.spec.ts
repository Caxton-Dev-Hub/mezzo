import { DataSource, Repository } from 'typeorm';
import { LedgerService } from './ledger.service';
import { LedgerAccount } from '../database/entities/ledger-account.entity';
import { LedgerPosting } from '../database/entities/ledger-posting.entity';
import { LedgerEntry } from '../database/entities/ledger-entry.entity';
import { Money } from '../common/money/money';
import { EntryDirection } from './entities/entry-direction.enum';
import { userWalletRef, escrowHoldingRef } from './account-refs';
import { UnbalancedPostingError } from './errors/unbalanced-posting.error';
import { EmptyPostingError } from './errors/empty-posting.error';

function buildHarness(): {
  service: LedgerService;
  transactionSpy: jest.Mock;
  postingsFindOne: jest.Mock;
} {
  const postingsFindOne = jest.fn().mockResolvedValue(null);
  const postings = { findOne: postingsFindOne } as unknown as Repository<LedgerPosting>;
  const accounts = {} as unknown as Repository<LedgerAccount>;
  const entries = {} as unknown as Repository<LedgerEntry>;
  const transactionSpy = jest.fn();
  const dataSource = { transaction: transactionSpy } as unknown as DataSource;

  return {
    service: new LedgerService(accounts, postings, entries, dataSource),
    transactionSpy,
    postingsFindOne,
  };
}

describe('LedgerService.postTransaction', () => {
  it('throws EmptyPostingError for fewer than two entries and never checks idempotency or opens a transaction', async () => {
    const { service, transactionSpy, postingsFindOne } = buildHarness();

    await expect(
      service.postTransaction(
        [{ accountRef: userWalletRef('u1'), direction: EntryDirection.CREDIT, money: Money.of(100, 'NGN') }],
        { idempotencyKey: 'k1' },
      ),
    ).rejects.toBeInstanceOf(EmptyPostingError);

    expect(postingsFindOne).not.toHaveBeenCalled();
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('throws UnbalancedPostingError when debits and credits differ and never opens a transaction', async () => {
    const { service, transactionSpy, postingsFindOne } = buildHarness();

    await expect(
      service.postTransaction(
        [
          {
            accountRef: escrowHoldingRef('e1'),
            direction: EntryDirection.DEBIT,
            money: Money.of(1_000, 'NGN'),
          },
          {
            accountRef: userWalletRef('u1'),
            direction: EntryDirection.CREDIT,
            money: Money.of(900, 'NGN'),
          },
        ],
        { idempotencyKey: 'k2' },
      ),
    ).rejects.toBeInstanceOf(UnbalancedPostingError);

    expect(postingsFindOne).not.toHaveBeenCalled();
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('returns the existing posting without opening a transaction when the idempotency key was already posted', async () => {
    const { service, transactionSpy, postingsFindOne } = buildHarness();
    const existing = { id: 'existing-posting', idempotencyKey: 'k3' } as LedgerPosting;
    postingsFindOne.mockResolvedValue(existing);

    const result = await service.postTransaction(
      [
        { accountRef: escrowHoldingRef('e1'), direction: EntryDirection.DEBIT, money: Money.of(500, 'NGN') },
        { accountRef: userWalletRef('u1'), direction: EntryDirection.CREDIT, money: Money.of(500, 'NGN') },
      ],
      { idempotencyKey: 'k3' },
    );

    expect(result).toBe(existing);
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('balances multiple currencies independently', async () => {
    const { service, transactionSpy, postingsFindOne } = buildHarness();
    postingsFindOne.mockResolvedValue(null);

    await expect(
      service.postTransaction(
        [
          { accountRef: escrowHoldingRef('e1'), direction: EntryDirection.DEBIT, money: Money.of(500, 'NGN') },
          { accountRef: userWalletRef('u1'), direction: EntryDirection.CREDIT, money: Money.of(500, 'USD') },
        ],
        { idempotencyKey: 'k4' },
      ),
    ).rejects.toBeInstanceOf(UnbalancedPostingError);

    expect(transactionSpy).not.toHaveBeenCalled();
  });
});
