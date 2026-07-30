import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentIntent } from '../database/entities/payment-intent.entity';
import { EscrowModule } from '../escrow/escrow.module';
import { UsersModule } from '../users/users.module';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentIntent]), EscrowModule, UsersModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
})
export class ReceiptsModule {}
