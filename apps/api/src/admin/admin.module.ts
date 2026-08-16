import { Module } from '@nestjs/common';
import { DisputeModule } from '../disputes/dispute.module';
import { ArbitrationModule } from '../arbitration/arbitration.module';
import { LedgerModule } from '../ledger/ledger.module';
import { KycModule } from '../kyc/kyc.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { EscrowModule } from '../escrow/escrow.module';
import { PaymentsModule } from '../payments/payments.module';
import { SettingsModule } from '../settings/settings.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { ChatModule } from '../chat/chat.module';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    DisputeModule,
    ArbitrationModule,
    LedgerModule,
    KycModule,
    UsersModule,
    AuditModule,
    EscrowModule,
    PaymentsModule,
    SettingsModule,
    WaitlistModule,
    ChatModule,
    AuthModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
