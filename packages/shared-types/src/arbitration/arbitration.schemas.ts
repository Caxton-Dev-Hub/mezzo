import { z } from 'zod';
import { disputeResolutionOutcomeSchema } from '../disputes/dispute.schemas';

export const arbitrationStatusSchema = z.enum(['RECOMMENDED', 'NEEDS_HUMAN']);

export type ArbitrationStatus = z.infer<typeof arbitrationStatusSchema>;

export const abstentionReasonSchema = z.enum([
  'PARSE_FAILURE',
  'NO_CITED_EVIDENCE',
  'UNRESOLVED_INTEGRITY_FLAGS',
  'CONTRADICTORY_OR_MISSING_EVIDENCE',
  'LOW_CONFIDENCE',
  'PROVIDER_ERROR',
]);

export type AbstentionReason = z.infer<typeof abstentionReasonSchema>;

export const arbitrationRecordResponseSchema = z.object({
  id: z.string().uuid(),
  disputeId: z.string().uuid(),
  provider: z.string(),
  status: arbitrationStatusSchema,
  recommendedOutcome: disputeResolutionOutcomeSchema.nullable(),
  splitRatio: z.number().int().nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  citedEvidenceIds: z.array(z.string()),
  contradictions: z.array(z.string()),
  missingEvidence: z.array(z.string()),
  abstentionReason: abstentionReasonSchema.nullable(),
  createdAt: z.coerce.date(),
});

export type ArbitrationRecordResponse = z.infer<typeof arbitrationRecordResponseSchema>;
