import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerAccount } from '../database/entities/ledger-account.entity';
import { LedgerPosting } from '../database/entities/ledger-posting.entity';
import { LedgerEntry } from '../database/entities/ledger-entry.entity';
import { LedgerService } from './ledger.service';
import { ReconciliationService } from './reconciliation.service';
import { ObservabilityModule } from '../observability/observability.module';

@Module({
  imports: [TypeOrmModule.forFeature([LedgerAccount, LedgerPosting, LedgerEntry]), ObservabilityModule],
  providers: [LedgerService, ReconciliationService],
  exports: [LedgerService, ReconciliationService],
})
export class LedgerModule {}
