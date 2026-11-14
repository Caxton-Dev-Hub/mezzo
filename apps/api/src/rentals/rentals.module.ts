import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Rental } from '../database/entities/rental.entity';
import { RentalCharge } from '../database/entities/rental-charge.entity';
import { Powerbank } from '../database/entities/powerbank.entity';
import { OutstandingBalance } from '../database/entities/outstanding-balance.entity';
import { VerificationSubmission } from '../database/entities/verification-submission.entity';
import { User } from '../database/entities/user.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { AuditModule } from '../audit/audit.module';
import { ShopsModule } from '../shops/shops.module';
import { RentalsService } from './rentals.service';
import { RentalsController } from './rentals.controller';
import { OverdueAccrualProcessor } from './overdue-accrual.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Rental,
      RentalCharge,
      Powerbank,
      OutstandingBalance,
      VerificationSubmission,
      User,
    ]),
    BullModule.registerQueue({ name: 'rental-accrual' }),
    LedgerModule,
    AuditModule,
    ShopsModule,
  ],
  providers: [RentalsService, OverdueAccrualProcessor],
  controllers: [RentalsController],
  exports: [RentalsService],
})
export class RentalsModule implements OnModuleInit {
  constructor(
    @InjectQueue('rental-accrual')
    private readonly rentalAccrualQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rentalAccrualQueue.add(
      'overdue-accrual',
      {},
      {
        repeat: {
          pattern: '0 * * * *',
        },
      },
    );
  }
}
