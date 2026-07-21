import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvidenceItem } from '../database/entities/evidence-item.entity';
import { EvidenceFlag } from '../database/entities/evidence-flag.entity';
import { EscrowModule } from '../escrow/escrow.module';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { MediaAnalysisService } from './media-analysis.service';
import { S3StorageProvider } from './storage/s3-storage.provider';
import { STORAGE_PROVIDER } from './storage/storage-provider.interface';

@Module({
  imports: [TypeOrmModule.forFeature([EvidenceItem, EvidenceFlag]), EscrowModule],
  controllers: [EvidenceController],
  providers: [
    EvidenceService,
    MediaAnalysisService,
    { provide: STORAGE_PROVIDER, useClass: S3StorageProvider },
  ],
  exports: [EvidenceService],
})
export class EvidenceModule {}
