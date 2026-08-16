import { z } from 'zod';
import {
  disputePacketResponseSchema,
  disputeResponseSchema,
  disputeStateSchema,
} from '../disputes/dispute.schemas';
import { arbitrationRecordResponseSchema } from '../arbitration/arbitration.schemas';
import { escrowRoleSchema, escrowStateSchema } from '../escrow/escrow.schemas';
import { moneySchema } from '../money/money.schemas';
import { paymentIntentStatusSchema, payoutStatusSchema } from '../payments/payments.schemas';
import { userRoleSchema, userStatusSchema } from '../users/user.schemas';
import { kycTierSchema } from '../kyc/kyc.schemas';
import { paginationQuerySchema } from '../common/pagination.schemas';

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

export const adminUserListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(320).optional(),
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional(),
  kycTier: kycTierSchema.optional(),
});

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export const adminUserListItemResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: userRoleSchema,
  status: userStatusSchema,
  kycTier: kycTierSchema,
  createdAt: z.coerce.date(),
});

export type AdminUserListItemResponse = z.infer<typeof adminUserListItemResponseSchema>;

export const adminUserListResponseSchema = z.object({
  items: z.array(adminUserListItemResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;

export const adminUserDetailEscrowSchema = z.object({
  id: z.string().uuid(),
  state: escrowStateSchema,
  role: escrowRoleSchema,
  itemDescription: z.string().nullable(),
  price: moneySchema.nullable(),
  updatedAt: z.coerce.date(),
});

export type AdminUserDetailEscrow = z.infer<typeof adminUserDetailEscrowSchema>;

export const adminUserDetailDisputeSchema = z.object({
  id: z.string().uuid(),
  escrowId: z.string().uuid(),
  state: disputeStateSchema,
  createdAt: z.coerce.date(),
});

export type AdminUserDetailDispute = z.infer<typeof adminUserDetailDisputeSchema>;

export const adminUserDetailPaymentIntentSchema = z.object({
  id: z.string().uuid(),
  escrowId: z.string().uuid(),
  amount: moneySchema,
  status: paymentIntentStatusSchema,
  createdAt: z.coerce.date(),
});

export type AdminUserDetailPaymentIntent = z.infer<typeof adminUserDetailPaymentIntentSchema>;

export const adminUserDetailPayoutSchema = z.object({
  id: z.string().uuid(),
  amount: moneySchema,
  status: payoutStatusSchema,
  createdAt: z.coerce.date(),
});

export type AdminUserDetailPayout = z.infer<typeof adminUserDetailPayoutSchema>;

export const adminUserDetailResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: userRoleSchema,
  status: userStatusSchema,
  kycTier: kycTierSchema,
  phone: z.string().nullable(),
  businessName: z.string().nullable(),
  emailVerifiedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  escrows: z.array(adminUserDetailEscrowSchema),
  disputes: z.array(adminUserDetailDisputeSchema),
  paymentIntents: z.array(adminUserDetailPaymentIntentSchema),
  payouts: z.array(adminUserDetailPayoutSchema),
});

export type AdminUserDetailResponse = z.infer<typeof adminUserDetailResponseSchema>;

export const updateUserRoleSchema = z.object({
  role: userRoleSchema,
  reason: z.string().trim().min(1).max(2000),
});

export type UpdateUserRoleDto = z.infer<typeof updateUserRoleSchema>;

export const updateUserStatusSchema = z.object({
  status: userStatusSchema,
  reason: z.string().trim().min(1).max(2000),
});

export type UpdateUserStatusDto = z.infer<typeof updateUserStatusSchema>;

export const updateUserRoleResultSchema = z.object({
  before: userRoleSchema,
  after: userRoleSchema,
});

export type UpdateUserRoleResult = z.infer<typeof updateUserRoleResultSchema>;

export const updateUserStatusResultSchema = z.object({
  before: userStatusSchema,
  after: userStatusSchema,
});

export type UpdateUserStatusResult = z.infer<typeof updateUserStatusResultSchema>;

export const adminActionReasonSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export type AdminActionReasonDto = z.infer<typeof adminActionReasonSchema>;

export const hideChatMessageResponseSchema = z.object({
  id: z.string().uuid(),
  hiddenAt: z.coerce.date(),
  hiddenBy: z.string().uuid(),
});

export type HideChatMessageResponse = z.infer<typeof hideChatMessageResponseSchema>;
