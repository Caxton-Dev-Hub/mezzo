import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerAccount } from '../database/entities/ledger-account.entity';
import { LedgerEntry } from '../database/entities/ledger-entry.entity';
import { EntryDirection } from './entities/entry-direction.enum';
import { LedgerService } from './ledger.service';
import { MetricsService } from '../observability/metrics.service';
import { ALERTS_SERVICE, AlertsService } from '../observability/alerts.interface';

export interface ReconciliationReport {
  globalBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
  driftedAccountRefs: string[];
}

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    @InjectRepository(LedgerEntry)
    private readonly entries: Repository<LedgerEntry>,
    private readonly ledgerService: LedgerService,
    private readonly metricsService: MetricsService,
    @Inject(ALERTS_SERVICE) private readonly alertsService: AlertsService,
  ) {}

  async reconcile(): Promise<ReconciliationReport> {
    const rows = await this.entries
      .createQueryBuilder('entry')
      .select('entry.direction', 'direction')
      .addSelect('COALESCE(SUM(entry.amount), 0)', 'total')
      .groupBy('entry.direction')
      .getRawMany<{ direction: EntryDirection; total: string }>();

    const totalDebits = Number(rows.find((row) => row.direction === EntryDirection.DEBIT)?.total ?? 0);
    const totalCredits = Number(rows.find((row) => row.direction === EntryDirection.CREDIT)?.total ?? 0);

    const allAccounts = await this.accounts.find();
    const driftedAccountRefs: string[] = [];

    for (const account of allAccounts) {
      const derived = await this.ledgerService.computeDerivedBalance(account.id, account.normalBalance);
      if (derived !== account.cachedBalance) {
        driftedAccountRefs.push(account.ref);
      }
    }

    const report: ReconciliationReport = {
      globalBalanced: totalDebits === totalCredits,
      totalDebits,
      totalCredits,
      driftedAccountRefs,
    };

    if (!report.globalBalanced || driftedAccountRefs.length > 0) {
      this.metricsService.incrementLedgerDrift(Math.max(driftedAccountRefs.length, 1));
      this.alertsService.fire({
        name: 'LEDGER_DRIFT',
        severity: 'critical',
        message: 'Ledger reconciliation detected a drift between derived and cached balances',
        context: { ...report },
      });
    }

    return report;
  }
}
