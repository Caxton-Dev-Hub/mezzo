import { Module } from '@nestjs/common';
import { DisputeModule } from '../disputes/dispute.module';
import { ArbitrationModule } from '../arbitration/arbitration.module';
import { LedgerModule } from '../ledger/ledger.module';
import { KycModule } from '../kyc/kyc.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [DisputeModule, ArbitrationModule, LedgerModule, KycModule, UsersModule, AuditModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
