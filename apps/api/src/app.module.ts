import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { isDatabaseConfigured } from './database/persistence-mode';
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SettingsModule } from './settings/settings.module';
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
import { ObservabilityModule } from './observability/observability.module';
import { AuditModule } from './audit/audit.module';
import { AdminModule } from './admin/admin.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { WaitlistModule } from './waitlist/waitlist.module';

const databaseBacked = isDatabaseConfigured();

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ConfigModule,
    DatabaseModule.register(),
    HealthModule,
    CommonModule,
    ...(databaseBacked ? [ObservabilityModule, AuditModule, QueueModule] : []),
    UsersModule,
    AuthModule,
    ...(databaseBacked
      ? [
          SettingsModule,
          KycModule,
          NotificationsModule,
          EscrowModule,
          EvidenceModule,
          ChatModule,
          LedgerModule,
          PaymentsModule,
          DisputeModule,
          ArbitrationModule,
          AdminModule,
          ReceiptsModule,
          WhatsappModule,
          WaitlistModule,
        ]
      : []),
  ],
})
export class AppModule {}
