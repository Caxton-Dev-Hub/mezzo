import { ArbitrationRecordResponse } from '@mezzo/shared-types';
import { ArbitrationRecord } from '../../database/entities/arbitration-record.entity';

export type { ArbitrationRecordResponse };

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
