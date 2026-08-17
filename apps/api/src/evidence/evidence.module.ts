import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvidenceItem } from '../database/entities/evidence-item.entity';
import { EvidenceFlag } from '../database/entities/evidence-flag.entity';
import { EscrowModule } from '../escrow/escrow.module';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { MediaAnalysisService } from './media-analysis.service';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([EvidenceItem, EvidenceFlag]), EscrowModule, StorageModule],
  controllers: [EvidenceController],
  providers: [EvidenceService, MediaAnalysisService],
  exports: [EvidenceService, MediaAnalysisService],
})
export class EvidenceModule {}
