import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { LedgerAccount } from '../database/entities/ledger-account.entity';
import { LedgerPosting } from '../database/entities/ledger-posting.entity';
import { LedgerEntry } from '../database/entities/ledger-entry.entity';
import { Currency } from '../common/money/currency';
import { Money } from '../common/money/money';
import { CurrencyMismatchError } from '../common/money/errors/currency-mismatch.error';
import { EntryDirection } from './entities/entry-direction.enum';
import { parseAccountRef } from './account-refs';
import { UnbalancedPostingError } from './errors/unbalanced-posting.error';
import { EmptyPostingError } from './errors/empty-posting.error';
import { isUniqueViolation } from './is-unique-violation';

export interface PostingLine {
  accountRef: string;
  direction: EntryDirection;
  money: Money;
}

export interface PostTransactionOptions {
  idempotencyKey: string;
  correlationId?: string;
}

export interface AccountBalance {
  amount: number;
  currency: Currency;
}

@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    @InjectRepository(LedgerPosting)
    private readonly postings: Repository<LedgerPosting>,
    @InjectRepository(LedgerEntry)
    private readonly entries: Repository<LedgerEntry>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async postTransaction(
    lines: PostingLine[],
    options: PostTransactionOptions,
    manager?: EntityManager,
  ): Promise<LedgerPosting> {
    if (lines.length < 2) {
      throw new EmptyPostingError();
    }
    this.assertBalanced(lines);

    if (manager) {
      return this.postWithinManager(manager, lines, options);
    }

    const existing = await this.postings.findOne({ where: { idempotencyKey: options.idempotencyKey } });
    if (existing) {
      return existing;
    }

    try {
      return await this.dataSource.transaction((txManager) =>
        this.postWithinManager(txManager, lines, options),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.postings.findOne({ where: { idempotencyKey: options.idempotencyKey } });
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  private async postWithinManager(
    manager: EntityManager,
    lines: PostingLine[],
    options: PostTransactionOptions,
  ): Promise<LedgerPosting> {
    const existing = await manager.findOne(LedgerPosting, {
      where: { idempotencyKey: options.idempotencyKey },
    });
    if (existing) {
      return existing;
    }

    const posting = await manager.save(
      LedgerPosting,
      manager.create(LedgerPosting, {
        idempotencyKey: options.idempotencyKey,
        correlationId: options.correlationId ?? null,
      }),
    );

    for (const line of lines) {
      const account = await this.getOrCreateAccount(manager, line.accountRef, line.money.currency);
      if (account.currency !== line.money.currency) {
        throw new CurrencyMismatchError(account.currency, line.money.currency);
      }

      await manager.save(
        LedgerEntry,
        manager.create(LedgerEntry, {
          postingId: posting.id,
          accountId: account.id,
          direction: line.direction,
          amount: line.money.amount,
          currency: line.money.currency,
        }),
      );

      const delta = account.normalBalance === line.direction ? line.money.amount : -line.money.amount;
      await manager
        .createQueryBuilder()
        .update(LedgerAccount)
        .set({ cachedBalance: () => 'cached_balance + :delta', cachedAt: () => 'now()' })
        .where('id = :id', { id: account.id })
        .setParameter('delta', delta)
        .execute();
    }

    return posting;
  }

  async listPostingsByCorrelationId(correlationId: string): Promise<LedgerPosting[]> {
    return this.postings.find({ where: { correlationId }, order: { createdAt: 'ASC' } });
  }

  async listEntriesForPosting(postingId: string): Promise<LedgerEntry[]> {
    return this.entries.find({ where: { postingId }, order: { createdAt: 'ASC' } });
  }

  async listEntriesByAccountRef(ref: string, limit = 100): Promise<LedgerEntry[]> {
    const account = await this.accounts.findOne({ where: { ref } });
    if (!account) {
      throw new NotFoundException('Ledger account not found');
    }
    return this.entries.find({
      where: { accountId: account.id },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getBalance(ref: string): Promise<AccountBalance> {
    const account = await this.accounts.findOne({ where: { ref } });
    if (!account) {
      throw new NotFoundException('Ledger account not found');
    }

    const amount = await this.computeDerivedBalance(account.id, account.normalBalance);
    return { amount, currency: account.currency };
  }

  async rebuildBalance(ref: string): Promise<AccountBalance> {
    const account = await this.accounts.findOne({ where: { ref } });
    if (!account) {
      throw new NotFoundException('Ledger account not found');
    }

    const amount = await this.computeDerivedBalance(account.id, account.normalBalance);
    await this.accounts.update(account.id, { cachedBalance: amount, cachedAt: new Date() });
    return { amount, currency: account.currency };
  }

  async computeDerivedBalance(accountId: string, normalBalance: EntryDirection): Promise<number> {
    const rows = await this.entries
      .createQueryBuilder('entry')
      .select('entry.direction', 'direction')
      .addSelect('COALESCE(SUM(entry.amount), 0)', 'total')
      .where('entry.accountId = :accountId', { accountId })
      .groupBy('entry.direction')
      .getRawMany<{ direction: EntryDirection; total: string }>();

    const debit = Number(rows.find((row) => row.direction === EntryDirection.DEBIT)?.total ?? 0);
    const credit = Number(rows.find((row) => row.direction === EntryDirection.CREDIT)?.total ?? 0);

    return normalBalance === EntryDirection.DEBIT ? debit - credit : credit - debit;
  }

  private assertBalanced(lines: PostingLine[]): void {
    const totals = new Map<Currency, { debit: number; credit: number }>();

    for (const line of lines) {
      const bucket = totals.get(line.money.currency) ?? { debit: 0, credit: 0 };
      if (line.direction === EntryDirection.DEBIT) {
        bucket.debit += line.money.amount;
      } else {
        bucket.credit += line.money.amount;
      }
      totals.set(line.money.currency, bucket);
    }

    for (const [currency, bucket] of totals) {
      if (bucket.debit !== bucket.credit) {
        throw new UnbalancedPostingError(currency, bucket.debit, bucket.credit);
      }
    }
  }

  private async getOrCreateAccount(
    manager: EntityManager,
    ref: string,
    currency: Currency,
  ): Promise<LedgerAccount> {
    const existing = await manager.findOne(LedgerAccount, { where: { ref } });
    if (existing) {
      return existing;
    }

    const { type, normalBalance } = parseAccountRef(ref);

    try {
      return await manager.save(
        LedgerAccount,
        manager.create(LedgerAccount, {
          ref,
          type,
          currency,
          normalBalance,
          cachedBalance: 0,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await manager.findOne(LedgerAccount, { where: { ref } });
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }
}
