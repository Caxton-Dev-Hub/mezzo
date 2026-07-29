import {
  EvidenceBundleResponse,
  EvidenceItemResponse,
  PresignEvidenceResponse,
} from '@mezzo/shared-types';
import { EvidenceItem } from '../../database/entities/evidence-item.entity';
import { EvidenceFlag } from '../../database/entities/evidence-flag.entity';

export type { EvidenceBundleResponse, EvidenceItemResponse, PresignEvidenceResponse };

export function toEvidenceItemResponse(
  item: EvidenceItem,
  flags: EvidenceFlag[],
): EvidenceItemResponse {
  return {
    id: item.id,
    escrowId: item.escrowId,
    uploaderId: item.uploaderId,
    phase: item.phase,
    contentHash: item.contentHash,
    declaredMime: item.declaredMime,
    detectedMime: item.detectedMime,
    sizeBytes: item.sizeBytes,
    width: item.width,
    height: item.height,
    capturedAt: item.capturedAt,
    deviceMake: item.deviceMake,
    deviceModel: item.deviceModel,
    gpsLatitude: item.gpsLatitude,
    gpsLongitude: item.gpsLongitude,
    flags: flags.filter((flag) => flag.evidenceItemId === item.id).map((flag) => flag.type),
    createdAt: item.createdAt,
  };
}
