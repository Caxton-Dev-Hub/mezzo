import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Accessory } from '../database/entities/accessory.entity';
import { AccessorySale } from '../database/entities/accessory-sale.entity';
import { AuditModule } from '../audit/audit.module';
import { ShopsModule } from '../shops/shops.module';
import { AccessoriesService } from './accessories.service';
import { AccessoriesController } from './accessories.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Accessory, AccessorySale]),
    AuditModule,
    ShopsModule,
  ],
  providers: [AccessoriesService],
  controllers: [AccessoriesController],
  exports: [AccessoriesService],
})
export class AccessoriesModule {}
