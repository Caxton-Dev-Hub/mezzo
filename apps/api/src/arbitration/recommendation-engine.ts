import { Injectable } from '@nestjs/common';
import { DisputeResolutionOutcome } from '../disputes/entities/dispute-resolution-outcome.enum';
import { ArbitrationStatus } from './entities/arbitration-status.enum';
import { AbstentionReason } from './entities/abstention-reason.enum';
import { arbitrationRecommendationSchema } from './dto/arbitration-recommendation.schema';
import { extractFirstJsonBlock } from './extract-json-block';

export interface RecommendationEngineContext {
  hasUnresolvedIntegrityFlags: boolean;
  confidenceThreshold: number;
}

export interface RecommendationResult {
  status: ArbitrationStatus;
  outcome: DisputeResolutionOutcome | null;
  splitSellerBps: number | null;
  confidence: number;
  rationale: string;
  citedEvidenceIds: string[];
  contradictions: string[];
  missingEvidence: string[];
  abstentionReason: AbstentionReason | null;
}

function empty(abstentionReason: AbstentionReason): RecommendationResult {
  return {
    status: ArbitrationStatus.NEEDS_HUMAN,
    outcome: null,
    splitSellerBps: null,
    confidence: 0,
    rationale: '',
    citedEvidenceIds: [],
    contradictions: [],
    missingEvidence: [],
    abstentionReason,
  };
}

@Injectable()
export class RecommendationEngine {
  evaluate(rawResponseText: string, context: RecommendationEngineContext): RecommendationResult {
    const candidate = extractFirstJsonBlock(rawResponseText);
    if (candidate === null) {
      return empty(AbstentionReason.PARSE_FAILURE);
    }

    const parsed = arbitrationRecommendationSchema.safeParse(candidate);
    if (!parsed.success) {
      return empty(AbstentionReason.PARSE_FAILURE);
    }

    const data = parsed.data;
    const base: Omit<RecommendationResult, 'status' | 'abstentionReason'> = {
      outcome: data.recommendedOutcome,
      splitSellerBps: data.splitRatio ?? null,
      confidence: data.confidence,
      rationale: data.rationale,
      citedEvidenceIds: data.citedEvidenceIds,
      contradictions: data.contradictions,
      missingEvidence: data.missingEvidence,
    };

    if (data.citedEvidenceIds.length === 0) {
      return { ...base, status: ArbitrationStatus.NEEDS_HUMAN, abstentionReason: AbstentionReason.NO_CITED_EVIDENCE };
    }

    if (context.hasUnresolvedIntegrityFlags) {
      return {
        ...base,
        status: ArbitrationStatus.NEEDS_HUMAN,
        abstentionReason: AbstentionReason.UNRESOLVED_INTEGRITY_FLAGS,
      };
    }

    if (data.contradictions.length > 0 || data.missingEvidence.length > 0) {
      return {
        ...base,
        status: ArbitrationStatus.NEEDS_HUMAN,
        abstentionReason: AbstentionReason.CONTRADICTORY_OR_MISSING_EVIDENCE,
      };
    }

    if (data.confidence < context.confidenceThreshold) {
      return { ...base, status: ArbitrationStatus.NEEDS_HUMAN, abstentionReason: AbstentionReason.LOW_CONFIDENCE };
    }

    return { ...base, status: ArbitrationStatus.RECOMMENDED, abstentionReason: null };
  }

  providerFailure(): RecommendationResult {
    return empty(AbstentionReason.PROVIDER_ERROR);
  }
}
