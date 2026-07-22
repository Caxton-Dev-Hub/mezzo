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
import { ArbitrationModule } from './arbitration/arbitration.module';
import { QueueModule } from './queue/queue.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatModule } from './chat/chat.module';

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
    NotificationsModule,
    EscrowModule,
    EvidenceModule,
    ChatModule,
    LedgerModule,
    PaymentsModule,
    DisputeModule,
    ArbitrationModule,
  ],
})
export class AppModule {}
