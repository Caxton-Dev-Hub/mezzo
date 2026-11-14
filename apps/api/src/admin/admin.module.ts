import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { ShopsModule } from '../shops/shops.module';
import { RentalsModule } from '../rentals/rentals.module';
import { AccessoriesModule } from '../accessories/accessories.module';
import { Rental } from '../database/entities/rental.entity';
import { AccessorySale } from '../database/entities/accessory-sale.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Rental, AccessorySale]),
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
    ShopsModule,
    RentalsModule,
    AccessoriesModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
