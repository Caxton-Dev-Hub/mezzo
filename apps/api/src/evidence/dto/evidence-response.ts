import { EvidenceItem } from '../../database/entities/evidence-item.entity';
import { EvidenceFlag } from '../../database/entities/evidence-flag.entity';
import { EvidencePhase } from '../entities/evidence-phase.enum';
import { EvidenceFlagType } from '../entities/evidence-flag-type.enum';

export interface EvidenceItemResponse {
  id: string;
  escrowId: string;
  uploaderId: string;
  phase: EvidencePhase;
  contentHash: string;
  declaredMime: string;
  detectedMime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  capturedAt: Date | null;
  deviceMake: string | null;
  deviceModel: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  flags: EvidenceFlagType[];
  createdAt: Date;
}

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

export interface EvidenceBundleResponse {
  escrowId: string;
  items: EvidenceItemResponse[];
}

export interface PresignEvidenceResponse {
  uploadUrl: string;
  key: string;
}
