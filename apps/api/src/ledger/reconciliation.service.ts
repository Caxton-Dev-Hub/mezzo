import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerAccount } from '../database/entities/ledger-account.entity';
import { LedgerEntry } from '../database/entities/ledger-entry.entity';
import { EntryDirection } from './entities/entry-direction.enum';
import { LedgerService } from './ledger.service';

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

    return {
      globalBalanced: totalDebits === totalCredits,
      totalDebits,
      totalCredits,
      driftedAccountRefs,
    };
  }
}
