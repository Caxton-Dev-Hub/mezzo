import { z } from 'zod';
import { DisputeReasonCode } from '../entities/dispute-reason-code.enum';
import { DisputeResolutionOutcome } from '../entities/dispute-resolution-outcome.enum';

export const raiseDisputeSchema = z.object({
  reasonCode: z.nativeEnum(DisputeReasonCode),
  statement: z.string().trim().min(1).max(4000),
});

export type RaiseDisputeDto = z.infer<typeof raiseDisputeSchema>;

export const resolveDisputeSchema = z
  .object({
    outcome: z.nativeEnum(DisputeResolutionOutcome),
    splitSellerBps: z.number().int().min(1).max(9_999).optional(),
    arbitrationRecordId: z.string().uuid().optional(),
  })
  .refine(
    (data) => (data.outcome === DisputeResolutionOutcome.SPLIT) === (data.splitSellerBps !== undefined),
    { message: 'splitSellerBps is required for, and only for, a SPLIT outcome' },
  );

export type ResolveDisputeDto = z.infer<typeof resolveDisputeSchema>;
