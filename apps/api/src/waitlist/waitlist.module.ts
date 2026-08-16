import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaitlistSignup } from '../database/entities/waitlist-signup.entity';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';
import { AuthRateLimitGuard } from '../auth/guards/auth-rate-limit.guard';

@Module({
  imports: [TypeOrmModule.forFeature([WaitlistSignup])],
  controllers: [WaitlistController],
  providers: [WaitlistService, AuthRateLimitGuard],
  exports: [WaitlistService],
})
export class WaitlistModule {}
