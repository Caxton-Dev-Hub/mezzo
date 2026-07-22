import { ArbitrationRecord } from '../../database/entities/arbitration-record.entity';
import { DisputeResolutionOutcome } from '../../disputes/entities/dispute-resolution-outcome.enum';
import { ArbitrationStatus } from '../entities/arbitration-status.enum';
import { AbstentionReason } from '../entities/abstention-reason.enum';

export interface ArbitrationRecordResponse {
  id: string;
  disputeId: string;
  provider: string;
  status: ArbitrationStatus;
  recommendedOutcome: DisputeResolutionOutcome | null;
  splitRatio: number | null;
  confidence: number;
  rationale: string;
  citedEvidenceIds: string[];
  contradictions: string[];
  missingEvidence: string[];
  abstentionReason: AbstentionReason | null;
  createdAt: Date;
}

export function toArbitrationRecordResponse(record: ArbitrationRecord): ArbitrationRecordResponse {
  return {
    id: record.id,
    disputeId: record.disputeId,
    provider: record.provider,
    status: record.status,
    recommendedOutcome: record.outcome,
    splitRatio: record.splitSellerBps,
    confidence: record.confidence,
    rationale: record.rationale,
    citedEvidenceIds: record.citedEvidenceIds,
    contradictions: record.contradictions,
    missingEvidence: record.missingEvidence,
    abstentionReason: record.abstentionReason,
    createdAt: record.createdAt,
  };
}
