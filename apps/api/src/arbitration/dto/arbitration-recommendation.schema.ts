import { z } from 'zod';
import { DisputeResolutionOutcome } from '../../disputes/entities/dispute-resolution-outcome.enum';

export const arbitrationRecommendationSchema = z
  .object({
    recommendedOutcome: z.nativeEnum(DisputeResolutionOutcome),
    splitRatio: z.number().int().min(1).max(9_999).optional(),
    confidence: z.number().min(0).max(1),
    rationale: z.string().min(1),
    citedEvidenceIds: z.array(z.string()),
    contradictions: z.array(z.string()),
    missingEvidence: z.array(z.string()),
  })
  .refine(
    (data) =>
      (data.recommendedOutcome === DisputeResolutionOutcome.SPLIT) === (data.splitRatio !== undefined),
    { message: 'splitRatio is required for, and only for, a SPLIT outcome' },
  );

export type ArbitrationRecommendation = z.infer<typeof arbitrationRecommendationSchema>;
