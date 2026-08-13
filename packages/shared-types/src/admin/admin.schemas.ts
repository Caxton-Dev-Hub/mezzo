import { z } from 'zod';
import { disputePacketResponseSchema, disputeResponseSchema } from '../disputes/dispute.schemas';
import { arbitrationRecordResponseSchema } from '../arbitration/arbitration.schemas';
import { escrowRoleSchema, escrowStateSchema } from '../escrow/escrow.schemas';
import { moneySchema } from '../money/money.schemas';
import { paymentIntentStatusSchema, payoutStatusSchema } from '../payments/payments.schemas';

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
  entityId: z.string(),
  reason: z.string().nullable(),
  beforeState: z.record(z.unknown()).nullable(),
  afterState: z.record(z.unknown()).nullable(),
  correlationId: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export type AuditEventResponse = z.infer<typeof auditEventResponseSchema>;

export const adminEscrowPartyResponseSchema = z.object({
  userId: z.string().uuid(),
  email: z.string(),
  role: escrowRoleSchema,
  termsAcceptedAt: z.coerce.date().nullable(),
});

export type AdminEscrowPartyResponse = z.infer<typeof adminEscrowPartyResponseSchema>;

export const adminEscrowResponseSchema = z.object({
  id: z.string().uuid(),
  state: escrowStateSchema,
  price: moneySchema.nullable(),
  itemDescription: z.string().nullable(),
  inspectionWindowHours: z.number().int().positive().nullable(),
  requiresVerification: z.boolean(),
  parties: z.array(adminEscrowPartyResponseSchema),
  trackingReference: z.string().nullable(),
  deliveredAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type AdminEscrowResponse = z.infer<typeof adminEscrowResponseSchema>;

export const adminPayoutResponseSchema = z.object({
  id: z.string().uuid(),
  sellerId: z.string().uuid(),
  sellerEmail: z.string(),
  amount: moneySchema,
  status: payoutStatusSchema,
  provider: z.string(),
  reference: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type AdminPayoutResponse = z.infer<typeof adminPayoutResponseSchema>;

export const adminPaymentIntentResponseSchema = z.object({
  id: z.string().uuid(),
  escrowId: z.string().uuid(),
  buyerId: z.string().uuid(),
  buyerEmail: z.string(),
  amount: moneySchema,
  status: paymentIntentStatusSchema,
  provider: z.string(),
  reference: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type AdminPaymentIntentResponse = z.infer<typeof adminPaymentIntentResponseSchema>;

export const adminRiskKindSchema = z.enum(['ESCROW', 'PAYOUT', 'PAYMENT_INTENT']);

export type AdminRiskKind = z.infer<typeof adminRiskKindSchema>;

export const adminRiskReasonSchema = z.enum([
  'AWAITING_COUNTERPARTY',
  'FUNDED_NOT_SHIPPED',
  'INSPECTION_OVERDUE',
  'DISPUTE_OPEN',
  'RESOLUTION_NOT_SETTLED',
  'PAYOUT_STUCK',
  'PAYOUT_FAILED',
  'PAYMENT_INTENT_STUCK',
  'PAYMENT_QUARANTINED',
]);

export type AdminRiskReason = z.infer<typeof adminRiskReasonSchema>;

export const adminRiskItemResponseSchema = z.object({
  kind: adminRiskKindSchema,
  id: z.string().uuid(),
  reason: adminRiskReasonSchema,
  escrowId: z.string().uuid().nullable(),
  amount: moneySchema.nullable(),
  waitingSince: z.coerce.date(),
  overdueByHours: z.number().int().nonnegative(),
});

export type AdminRiskItemResponse = z.infer<typeof adminRiskItemResponseSchema>;
