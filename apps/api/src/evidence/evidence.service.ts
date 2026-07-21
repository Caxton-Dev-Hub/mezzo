import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { EvidenceItem } from '../database/entities/evidence-item.entity';
import { EvidenceFlag } from '../database/entities/evidence-flag.entity';
import { EvidencePhase } from './entities/evidence-phase.enum';
import { EvidenceFlagType } from './entities/evidence-flag-type.enum';
import { isImageMime } from './allowed-media-types';
import { MediaAnalysisResult, MediaAnalysisService } from './media-analysis.service';
import { STORAGE_PROVIDER, StorageProvider } from './storage/storage-provider.interface';
import { EscrowService } from '../escrow/escrow.service';
import { PresignEvidenceDto, ConfirmEvidenceDto } from './dto/evidence.schemas';
import {
  EvidenceBundleResponse,
  EvidenceItemResponse,
  PresignEvidenceResponse,
  toEvidenceItemResponse,
} from './dto/evidence-response';
import { InvalidStorageKeyError } from './errors/invalid-storage-key.error';
import { MimeMismatchError } from './errors/mime-mismatch.error';

@Injectable()
export class EvidenceService {
  constructor(
    @InjectRepository(EvidenceItem)
    private readonly items: Repository<EvidenceItem>,
    @InjectRepository(EvidenceFlag)
    private readonly flags: Repository<EvidenceFlag>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
    private readonly mediaAnalysis: MediaAnalysisService,
    private readonly escrowService: EscrowService,
    private readonly configService: ConfigService,
  ) {}

  async presign(actorId: string, dto: PresignEvidenceDto): Promise<PresignEvidenceResponse> {
    await this.escrowService.assertIsParty(dto.escrowId, actorId);

    const key = `evidence/${dto.escrowId}/${randomUUID()}`;
    const uploadUrl = await this.storage.getPresignedUploadUrl(key, dto.mimeType);
    return { uploadUrl, key };
  }

  async confirm(actorId: string, dto: ConfirmEvidenceDto): Promise<EvidenceItemResponse> {
    await this.escrowService.assertIsParty(dto.escrowId, actorId);

    if (!dto.key.startsWith(`evidence/${dto.escrowId}/`)) {
      throw new InvalidStorageKeyError();
    }

    const buffer = await this.storage.getObject(dto.key);
    const analysis = await this.mediaAnalysis.analyze(buffer);

    if (!analysis.detectedMime || analysis.detectedMime !== dto.declaredMime) {
      await this.storage.deleteObject(dto.key).catch(() => undefined);
      throw new MimeMismatchError(dto.declaredMime, analysis.detectedMime);
    }
    const detectedMime: string = analysis.detectedMime;

    const flagTypes = await this.detectFlags(analysis);

    const item = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        EvidenceItem,
        manager.create(EvidenceItem, {
          escrowId: dto.escrowId,
          uploaderId: actorId,
          phase: dto.phase,
          storageKey: dto.key,
          contentHash: analysis.contentHash,
          declaredMime: dto.declaredMime,
          detectedMime,
          sizeBytes: analysis.sizeBytes,
          width: analysis.width,
          height: analysis.height,
          capturedAt: analysis.capturedAt,
          deviceMake: analysis.deviceMake,
          deviceModel: analysis.deviceModel,
          gpsLatitude: analysis.gpsLatitude,
          gpsLongitude: analysis.gpsLongitude,
        }),
      );

      for (const type of flagTypes) {
        await manager.save(EvidenceFlag, manager.create(EvidenceFlag, { evidenceItemId: saved.id, type }));
      }

      return saved;
    });

    const persistedFlags = flagTypes.map(
      (type) => ({ evidenceItemId: item.id, type }) as EvidenceFlag,
    );
    return toEvidenceItemResponse(item, persistedFlags);
  }

  async getBundle(actorId: string, escrowId: string): Promise<EvidenceBundleResponse> {
    await this.escrowService.assertIsParty(escrowId, actorId);

    const items = await this.items.find({
      where: { escrowId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    const itemIds = items.map((item) => item.id);
    const flags = itemIds.length > 0 ? await this.flags.find({ where: { evidenceItemId: In(itemIds) } }) : [];

    return {
      escrowId,
      items: items.map((item) => toEvidenceItemResponse(item, flags)),
    };
  }

  async hasAtLeastOne(escrowId: string, phase: EvidencePhase): Promise<boolean> {
    const count = await this.items.count({ where: { escrowId, phase } });
    return count > 0;
  }

  private async detectFlags(analysis: MediaAnalysisResult): Promise<EvidenceFlagType[]> {
    const flagTypes: EvidenceFlagType[] = [];

    const duplicate = await this.items.findOne({ where: { contentHash: analysis.contentHash } });
    if (duplicate) {
      flagTypes.push(EvidenceFlagType.DUPLICATE_CONTENT);
    }

    if (analysis.detectedMime && isImageMime(analysis.detectedMime) && !analysis.hasExif) {
      flagTypes.push(EvidenceFlagType.MISSING_METADATA);
    }

    if (analysis.capturedAt) {
      const driftHours = this.configService.getOrThrow<number>('EVIDENCE_TIMESTAMP_DRIFT_HOURS');
      const driftMs = Math.abs(Date.now() - analysis.capturedAt.getTime());
      if (driftMs > driftHours * 60 * 60 * 1000) {
        flagTypes.push(EvidenceFlagType.TIMESTAMP_MISMATCH);
      }
    }

    return flagTypes;
  }
}
