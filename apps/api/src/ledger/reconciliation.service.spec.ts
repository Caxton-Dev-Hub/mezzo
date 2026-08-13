import { Repository } from 'typeorm';
import { ReconciliationService } from './reconciliation.service';
import { LedgerService } from './ledger.service';
import { EntryDirection } from './entities/entry-direction.enum';
import { LedgerAccount } from '../database/entities/ledger-account.entity';
import { LedgerEntry } from '../database/entities/ledger-entry.entity';
import { MetricsService } from '../observability/metrics.service';
import { AlertsService } from '../observability/alerts.interface';

function buildAccount(overrides: Partial<LedgerAccount> = {}): LedgerAccount {
  return {
    id: 'account-1',
    ref: 'user:user-1:wallet',
    currency: 'NGN',
    normalBalance: EntryDirection.CREDIT,
    cachedBalance: 10_000,
    ...overrides,
  } as LedgerAccount;
}

interface Harness {
  service: ReconciliationService;
  computeDerivedBalance: jest.Mock;
  incrementLedgerDrift: jest.Mock;
  fire: jest.Mock;
}

function buildHarness(options: {
  totals?: { direction: EntryDirection; total: string }[];
  accounts?: LedgerAccount[];
  derived?: Record<string, number>;
}): Harness {
  const accountsFind = jest.fn().mockResolvedValue(options.accounts ?? []);
  const accounts = { find: accountsFind } as unknown as Repository<LedgerAccount>;

  const builder = {
    select: () => builder,
    addSelect: () => builder,
    groupBy: () => builder,
    getRawMany: () => Promise.resolve(options.totals ?? []),
  };
  const entries = {
    createQueryBuilder: () => builder,
  } as unknown as Repository<LedgerEntry>;

  const computeDerivedBalance = jest
    .fn()
    .mockImplementation((accountId: string) => Promise.resolve(options.derived?.[accountId] ?? 0));
  const ledgerService = { computeDerivedBalance } as unknown as LedgerService;

  const incrementLedgerDrift = jest.fn();
  const metricsService = { incrementLedgerDrift } as unknown as MetricsService;

  const fire = jest.fn();
  const alertsService = { fire } as unknown as AlertsService;

  return {
    service: new ReconciliationService(accounts, entries, ledgerService, metricsService, alertsService),
    computeDerivedBalance,
    incrementLedgerDrift,
    fire,
  };
}

const balancedTotals = [
  { direction: EntryDirection.DEBIT, total: '500000' },
  { direction: EntryDirection.CREDIT, total: '500000' },
];

describe('ReconciliationService.reconcile', () => {
  it('reports a balanced book with no drift and raises no alert', async () => {
    const harness = buildHarness({
      totals: balancedTotals,
      accounts: [buildAccount({ id: 'account-1', cachedBalance: 10_000 })],
      derived: { 'account-1': 10_000 },
    });

    const report = await harness.service.reconcile();

    expect(report).toEqual({
      globalBalanced: true,
      totalDebits: 500_000,
      totalCredits: 500_000,
      driftedAccountRefs: [],
    });
    expect(harness.fire).not.toHaveBeenCalled();
    expect(harness.incrementLedgerDrift).not.toHaveBeenCalled();
  });

  it('treats an empty ledger as balanced at zero', async () => {
    const harness = buildHarness({ totals: [], accounts: [] });

    const report = await harness.service.reconcile();

    expect(report).toEqual({
      globalBalanced: true,
      totalDebits: 0,
      totalCredits: 0,
      driftedAccountRefs: [],
    });
  });

  it('flags the book as unbalanced when debits and credits disagree', async () => {
    const harness = buildHarness({
      totals: [
        { direction: EntryDirection.DEBIT, total: '500000' },
        { direction: EntryDirection.CREDIT, total: '499999' },
      ],
      accounts: [],
    });

    const report = await harness.service.reconcile();

    expect(report.globalBalanced).toBe(false);
    expect(report.totalDebits).toBe(500_000);
    expect(report.totalCredits).toBe(499_999);
  });

  it('alerts and counts drift even when only the global totals disagree', async () => {
    const harness = buildHarness({
      totals: [
        { direction: EntryDirection.DEBIT, total: '10' },
        { direction: EntryDirection.CREDIT, total: '5' },
      ],
      accounts: [],
    });

    await harness.service.reconcile();

    expect(harness.incrementLedgerDrift).toHaveBeenCalledWith(1);
    expect(harness.fire).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'LEDGER_DRIFT', severity: 'critical' }),
    );
  });

  it('names every account whose cached balance disagrees with its entries', async () => {
    const harness = buildHarness({
      totals: balancedTotals,
      accounts: [
        buildAccount({ id: 'a1', ref: 'user:u1:wallet', cachedBalance: 10_000 }),
        buildAccount({ id: 'a2', ref: 'escrow:e1:holding', cachedBalance: 20_000 }),
        buildAccount({ id: 'a3', ref: 'platform:fee-revenue', cachedBalance: 500 }),
      ],
      derived: { a1: 10_000, a2: 19_000, a3: 400 },
    });

    const report = await harness.service.reconcile();

    expect(report.driftedAccountRefs).toEqual(['escrow:e1:holding', 'platform:fee-revenue']);
  });

  it('counts one drift per drifted account', async () => {
    const harness = buildHarness({
      totals: balancedTotals,
      accounts: [
        buildAccount({ id: 'a1', ref: 'r1', cachedBalance: 1 }),
        buildAccount({ id: 'a2', ref: 'r2', cachedBalance: 1 }),
      ],
      derived: { a1: 0, a2: 0 },
    });

    await harness.service.reconcile();

    expect(harness.incrementLedgerDrift).toHaveBeenCalledWith(2);
  });

  it('includes the full report in the alert context', async () => {
    const harness = buildHarness({
      totals: balancedTotals,
      accounts: [buildAccount({ id: 'a1', ref: 'r1', cachedBalance: 1 })],
      derived: { a1: 0 },
    });

    await harness.service.reconcile();

    expect(harness.fire).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          globalBalanced: true,
          totalDebits: 500_000,
          totalCredits: 500_000,
          driftedAccountRefs: ['r1'],
        },
      }),
    );
  });

  it('derives each account balance against its own normal side', async () => {
    const harness = buildHarness({
      totals: balancedTotals,
      accounts: [buildAccount({ id: 'a1', normalBalance: EntryDirection.DEBIT, cachedBalance: 0 })],
      derived: { a1: 0 },
    });

    await harness.service.reconcile();

    expect(harness.computeDerivedBalance).toHaveBeenCalledWith('a1', EntryDirection.DEBIT);
  });
});
