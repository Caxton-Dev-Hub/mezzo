import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { KycVerification } from '../database/entities/kyc-verification.entity';
import { KycEvent } from '../database/entities/kyc-event.entity';
import { KycDocument } from '../database/entities/kyc-document.entity';
import { SettingsModule } from '../settings/settings.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { StorageModule } from '../evidence/storage/storage.module';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { KycCapsService } from './kyc-caps.service';
import { KycTierGuard } from './guards/kyc-tier.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, KycVerification, KycEvent, KycDocument]),
    SettingsModule,
    EvidenceModule,
    StorageModule,
  ],
  controllers: [KycController],
  providers: [KycService, KycCapsService, KycTierGuard],
  exports: [KycService, KycTierGuard],
})
export class KycModule {}
