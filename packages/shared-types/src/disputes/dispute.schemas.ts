import { z } from 'zod';

export const disputeReasonCodeSchema = z.enum([
  'NOT_RECEIVED',
  'NOT_AS_DESCRIBED',
  'DAMAGED',
  'WRONG_ITEM',
  'PARTIAL',
]);

export type DisputeReasonCode = z.infer<typeof disputeReasonCodeSchema>;

export const raiseDisputeSchema = z.object({
  reasonCode: disputeReasonCodeSchema,
  statement: z.string().trim().min(1).max(4000),
});

export type RaiseDisputeDto = z.infer<typeof raiseDisputeSchema>;
