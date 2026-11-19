import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Powerbank } from '../database/entities/powerbank.entity';
import { AuditModule } from '../audit/audit.module';
import { ShopsModule } from '../shops/shops.module';
import { PowerbanksService } from './powerbanks.service';
import { PowerbanksController } from './powerbanks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Powerbank]),
    AuditModule,
    ShopsModule,
  ],
  providers: [PowerbanksService],
  controllers: [PowerbanksController],
  exports: [PowerbanksService],
})
export class PowerbanksModule {}
