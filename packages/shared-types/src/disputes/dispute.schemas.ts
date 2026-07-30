import { z } from 'zod';
import { currencySchema } from '../money/money.schemas';
import { escrowTermsResponseSchema } from '../escrow/escrow.schemas';
import { evidenceItemResponseSchema } from '../evidence/evidence.schemas';
import { chatMessageResponseSchema } from '../chat/chat.schemas';

export const disputeReasonCodeSchema = z.enum([
  'NOT_RECEIVED',
  'NOT_AS_DESCRIBED',
  'DAMAGED',
  'WRONG_ITEM',
  'PARTIAL',
]);

export type DisputeReasonCode = z.infer<typeof disputeReasonCodeSchema>;

export const disputeStateSchema = z.enum(['OPEN', 'EVIDENCE', 'UNDER_REVIEW', 'RESOLVED']);

export type DisputeState = z.infer<typeof disputeStateSchema>;

export const disputeResolutionOutcomeSchema = z.enum([
  'RELEASE_TO_SELLER',
  'REFUND_TO_BUYER',
  'SPLIT',
]);

export type DisputeResolutionOutcome = z.infer<typeof disputeResolutionOutcomeSchema>;

export const raiseDisputeSchema = z.object({
  reasonCode: disputeReasonCodeSchema,
  statement: z.string().trim().min(1).max(4000),
});

export type RaiseDisputeDto = z.infer<typeof raiseDisputeSchema>;

export const resolveDisputeSchema = z
  .object({
    outcome: disputeResolutionOutcomeSchema,
    splitSellerBps: z.number().int().min(1).max(9_999).optional(),
    arbitrationRecordId: z.string().uuid().optional(),
  })
  .refine((data) => (data.outcome === 'SPLIT') === (data.splitSellerBps !== undefined), {
    message: 'splitSellerBps is required for, and only for, a SPLIT outcome',
  });

export type ResolveDisputeDto = z.infer<typeof resolveDisputeSchema>;

export const disputeResponseSchema = z.object({
  id: z.string().uuid(),
  escrowId: z.string().uuid(),
  raisedByUserId: z.string().uuid(),
  reasonCode: disputeReasonCodeSchema,
  statement: z.string(),
  state: disputeStateSchema,
  evidenceWindowExpiresAt: z.coerce.date(),
  resolvedOutcome: disputeResolutionOutcomeSchema.nullable(),
  resolvedByUserId: z.string().uuid().nullable(),
  resolvedAt: z.coerce.date().nullable(),
  resolvedSellerAmount: z.number().int().nullable(),
  resolvedBuyerAmount: z.number().int().nullable(),
  resolvedFeeAmount: z.number().int().nullable(),
  resolvedCurrency: currencySchema.nullable(),
  resolvedArbitrationRecordId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type DisputeResponse = z.infer<typeof disputeResponseSchema>;

export const disputeTimelineEntrySchema = z.object({
  source: z.enum(['ESCROW', 'DISPUTE']),
  fromState: z.string(),
  toState: z.string(),
  actorId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  correlationId: z.string(),
  createdAt: z.coerce.date(),
});

export type DisputeTimelineEntry = z.infer<typeof disputeTimelineEntrySchema>;

export const disputeSubmissionFlagsSchema = z.object({
  buyerSubmitted: z.boolean(),
  sellerSubmitted: z.boolean(),
  evidenceWindowElapsed: z.boolean(),
});

export type DisputeSubmissionFlags = z.infer<typeof disputeSubmissionFlagsSchema>;

export const disputePacketResponseSchema = z.object({
  dispute: disputeResponseSchema,
  frozenTerms: escrowTermsResponseSchema,
  timeline: z.array(disputeTimelineEntrySchema),
  creationEvidence: z.array(evidenceItemResponseSchema),
  buyerEvidence: z.array(evidenceItemResponseSchema),
  sellerEvidence: z.array(evidenceItemResponseSchema),
  submissionFlags: disputeSubmissionFlagsSchema,
  chatTranscript: z.array(chatMessageResponseSchema),
});

export type DisputePacketResponse = z.infer<typeof disputePacketResponseSchema>;
