import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shop } from '../database/entities/shop.entity';
import { StaffAssignment } from '../database/entities/staff-assignment.entity';
import { User } from '../database/entities/user.entity';
import { VerificationSubmission } from '../database/entities/verification-submission.entity';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../evidence/storage/storage.module';
import { ShopsService } from './shops.service';
import { ShopsController } from './shops.controller';
import { StaffScopeGuard } from './guards/staff-scope.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shop, StaffAssignment, User, VerificationSubmission]),
    AuditModule,
    StorageModule,
  ],
  providers: [ShopsService, StaffScopeGuard],
  controllers: [ShopsController],
  exports: [ShopsService],
})
export class ShopsModule {}
