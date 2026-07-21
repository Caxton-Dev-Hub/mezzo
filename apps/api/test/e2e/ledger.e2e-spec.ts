import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { LedgerService } from '../../src/ledger/ledger.service';
import { ReconciliationService } from '../../src/ledger/reconciliation.service';
import { LedgerAccount } from '../../src/database/entities/ledger-account.entity';
import { LedgerEntry } from '../../src/database/entities/ledger-entry.entity';
import { EntryDirection } from '../../src/ledger/entities/entry-direction.enum';
import {
  escrowHoldingRef,
  platformFeeRevenueRef,
  providerClearingRef,
  userWalletRef,
} from '../../src/ledger/account-refs';
import { Money } from '../../src/common/money/money';
import { CurrencyMismatchError } from '../../src/common/money/errors/currency-mismatch.error';
import { UnbalancedPostingError } from '../../src/ledger/errors/unbalanced-posting.error';

describe('Ledger (e2e)', () => {
  let app: INestApplication;
  let ledger: LedgerService;
  let reconciliation: ReconciliationService;
  let ledgerAccounts: Repository<LedgerAccount>;
  let ledgerEntries: Repository<LedgerEntry>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ledger = app.get(LedgerService);
    reconciliation = app.get(ReconciliationService);
    ledgerAccounts = app.get(getRepositoryToken(LedgerAccount));
    ledgerEntries = app.get(getRepositoryToken(LedgerEntry));
  });

  afterAll(async () => {
    await app.close();
  });

  function fundEscrow(escrowId: string, provider: string, amountKobo: number, key: string) {
    return ledger.postTransaction(
      [
        {
          accountRef: providerClearingRef(provider),
          direction: EntryDirection.DEBIT,
          money: Money.of(amountKobo, 'NGN'),
        },
        {
          accountRef: escrowHoldingRef(escrowId),
          direction: EntryDirection.CREDIT,
          money: Money.of(amountKobo, 'NGN'),
        },
      ],
      { idempotencyKey: key },
    );
  }

  it('commits a balanced posting and derives the correct account balances', async () => {
    const escrowId = randomUUID();
    const posting = await fundEscrow(escrowId, 'paystack', 100_000, `fund-${escrowId}`);

    expect(posting.id).toBeDefined();
    expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({ amount: 100_000, currency: 'NGN' });
    expect(await ledger.getBalance(providerClearingRef('paystack'))).toMatchObject({ currency: 'NGN' });
  });

  it('rejects an unbalanced posting atomically -- no posting or entries are created', async () => {
    const escrowId = randomUUID();
    const key = `unbalanced-${escrowId}`;

    await expect(
      ledger.postTransaction(
        [
          {
            accountRef: escrowHoldingRef(escrowId),
            direction: EntryDirection.CREDIT,
            money: Money.of(1_000, 'NGN'),
          },
          {
            accountRef: providerClearingRef('paystack'),
            direction: EntryDirection.DEBIT,
            money: Money.of(900, 'NGN'),
          },
        ],
        { idempotencyKey: key },
      ),
    ).rejects.toBeInstanceOf(UnbalancedPostingError);

    const account = await ledgerAccounts.findOne({ where: { ref: escrowHoldingRef(escrowId) } });
    expect(account).toBeNull();
  });

  it('is idempotent on a repeated idempotency key -- no double entries, same posting returned', async () => {
    const escrowId = randomUUID();
    const key = `dup-${escrowId}`;

    const first = await fundEscrow(escrowId, 'paystack', 50_000, key);
    const second = await fundEscrow(escrowId, 'paystack', 50_000, key);

    expect(second.id).toBe(first.id);
    expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({ amount: 50_000, currency: 'NGN' });

    const holdingAccount = await ledgerAccounts.findOneOrFail({
      where: { ref: escrowHoldingRef(escrowId) },
    });
    const entryCount = await ledgerEntries.count({ where: { accountId: holdingAccount.id } });
    expect(entryCount).toBe(1);
  });

  it('derived balance equals the signed sum of entries and matches a rebuild from scratch', async () => {
    const escrowId = randomUUID();
    await fundEscrow(escrowId, 'paystack', 75_000, `rebuild-fund-${escrowId}`);

    const feeAmount = 5_000;
    const releaseAmount = 70_000;
    await ledger.postTransaction(
      [
        {
          accountRef: escrowHoldingRef(escrowId),
          direction: EntryDirection.DEBIT,
          money: Money.of(feeAmount + releaseAmount, 'NGN'),
        },
        {
          accountRef: userWalletRef('seller-1'),
          direction: EntryDirection.CREDIT,
          money: Money.of(releaseAmount, 'NGN'),
        },
        {
          accountRef: platformFeeRevenueRef(),
          direction: EntryDirection.CREDIT,
          money: Money.of(feeAmount, 'NGN'),
        },
      ],
      { idempotencyKey: `rebuild-release-${escrowId}` },
    );

    const derived = await ledger.getBalance(escrowHoldingRef(escrowId));
    expect(derived).toEqual({ amount: 0, currency: 'NGN' });

    const rebuilt = await ledger.rebuildBalance(escrowHoldingRef(escrowId));
    expect(rebuilt).toEqual(derived);
  });

  it('rolls back the whole posting on a mid-transaction failure -- no orphan entries, retry succeeds', async () => {
    const escrowId = randomUUID();
    await fundEscrow(escrowId, 'paystack', 20_000, `partial-fund-${escrowId}`);
    const balanceBeforeFailure = await ledger.getBalance(escrowHoldingRef(escrowId));

    const key = `partial-release-${escrowId}`;
    await expect(
      ledger.postTransaction(
        [
          {
            accountRef: escrowHoldingRef(escrowId),
            direction: EntryDirection.DEBIT,
            money: Money.of(20_000, 'USD'),
          },
          {
            accountRef: userWalletRef('seller-2'),
            direction: EntryDirection.CREDIT,
            money: Money.of(20_000, 'USD'),
          },
        ],
        { idempotencyKey: key },
      ),
    ).rejects.toBeInstanceOf(CurrencyMismatchError);

    expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual(balanceBeforeFailure);

    const retried = await ledger.postTransaction(
      [
        {
          accountRef: escrowHoldingRef(escrowId),
          direction: EntryDirection.DEBIT,
          money: Money.of(20_000, 'NGN'),
        },
        {
          accountRef: userWalletRef('seller-2'),
          direction: EntryDirection.CREDIT,
          money: Money.of(20_000, 'NGN'),
        },
      ],
      { idempotencyKey: key },
    );

    expect(retried.id).toBeDefined();
    expect(await ledger.getBalance(escrowHoldingRef(escrowId))).toEqual({ amount: 0, currency: 'NGN' });
  });

  it('holds the global sum(debits) == sum(credits) invariant after a randomized sequence of postings', async () => {
    const batchId = randomUUID();

    for (let i = 0; i < 40; i += 1) {
      const amount = 1 + Math.floor(Math.random() * 250_000);
      const escrowId = `${batchId}-escrow-${i % 5}`;
      const sellerId = `${batchId}-seller-${i % 3}`;

      if (i % 2 === 0) {
        await ledger.postTransaction(
          [
            {
              accountRef: providerClearingRef('paystack'),
              direction: EntryDirection.DEBIT,
              money: Money.of(amount, 'NGN'),
            },
            {
              accountRef: escrowHoldingRef(escrowId),
              direction: EntryDirection.CREDIT,
              money: Money.of(amount, 'NGN'),
            },
          ],
          { idempotencyKey: `${batchId}-fund-${i}` },
        );
      } else {
        await ledger.postTransaction(
          [
            {
              accountRef: escrowHoldingRef(escrowId),
              direction: EntryDirection.DEBIT,
              money: Money.of(amount, 'NGN'),
            },
            {
              accountRef: userWalletRef(sellerId),
              direction: EntryDirection.CREDIT,
              money: Money.of(amount, 'NGN'),
            },
          ],
          { idempotencyKey: `${batchId}-release-${i}` },
        );
      }
    }

    const report = await reconciliation.reconcile();
    expect(report.globalBalanced).toBe(true);
    expect(report.totalDebits).toBe(report.totalCredits);
  });

  it('detects an artificially injected drift and flags the offending account, which rebuild fixes', async () => {
    const escrowId = randomUUID();
    await fundEscrow(escrowId, 'paystack', 33_000, `drift-fund-${escrowId}`);
    const ref = escrowHoldingRef(escrowId);

    const before = await reconciliation.reconcile();
    expect(before.driftedAccountRefs).not.toContain(ref);

    const account = await ledgerAccounts.findOneOrFail({ where: { ref } });
    await ledgerAccounts.update(account.id, { cachedBalance: account.cachedBalance + 999 });

    const afterCorruption = await reconciliation.reconcile();
    expect(afterCorruption.driftedAccountRefs).toContain(ref);

    await ledger.rebuildBalance(ref);
    const afterRebuild = await reconciliation.reconcile();
    expect(afterRebuild.driftedAccountRefs).not.toContain(ref);
  });
});
