import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { KycModule } from './kyc/kyc.module';
import { EscrowModule } from './escrow/escrow.module';
import { EvidenceModule } from './evidence/evidence.module';
import { LedgerModule } from './ledger/ledger.module';
import { PaymentsModule } from './payments/payments.module';
import { DisputeModule } from './disputes/dispute.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    CommonModule,
    QueueModule,
    UsersModule,
    AuthModule,
    KycModule,
    EscrowModule,
    EvidenceModule,
    LedgerModule,
    PaymentsModule,
    DisputeModule,
  ],
})
export class AppModule {}
