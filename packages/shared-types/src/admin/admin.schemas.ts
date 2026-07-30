import { z } from 'zod';
import { disputePacketResponseSchema, disputeResponseSchema } from '../disputes/dispute.schemas';
import { arbitrationRecordResponseSchema } from '../arbitration/arbitration.schemas';

export const adminDisputeSummaryResponseSchema = z.object({
  dispute: disputeResponseSchema,
  latestArbitrationRecord: arbitrationRecordResponseSchema.nullable(),
});

export type AdminDisputeSummaryResponse = z.infer<typeof adminDisputeSummaryResponseSchema>;

export const adminDisputePacketResponseSchema = z.object({
  packet: disputePacketResponseSchema,
  arbitrationRecords: z.array(arbitrationRecordResponseSchema),
});

export type AdminDisputePacketResponse = z.infer<typeof adminDisputePacketResponseSchema>;

export const auditEventResponseSchema = z.object({
  id: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  reason: z.string().nullable(),
  beforeState: z.record(z.unknown()).nullable(),
  afterState: z.record(z.unknown()).nullable(),
  correlationId: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export type AuditEventResponse = z.infer<typeof auditEventResponseSchema>;
