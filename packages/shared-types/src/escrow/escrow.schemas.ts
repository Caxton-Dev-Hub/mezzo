import { z } from 'zod';
import { moneySchema } from '../money/money.schemas';
import { evidenceItemResponseSchema } from '../evidence/evidence.schemas';

export const escrowRoleSchema = z.enum(['BUYER', 'SELLER']);

export type EscrowRole = z.infer<typeof escrowRoleSchema>;

export const escrowStateSchema = z.enum([
  'DRAFT',
  'PENDING_COUNTERPARTY',
  'AGREED',
  'FUNDED',
  'SHIPPED',
  'DELIVERED',
  'RELEASED',
  'DISPUTED',
  'RESOLVED_RELEASE',
  'RESOLVED_REFUND',
  'REFUNDED',
  'CANCELLED',
  'EXPIRED',
]);

export type EscrowState = z.infer<typeof escrowStateSchema>;

const termsSchema = {
  price: moneySchema,
  inspectionWindowHours: z.number().int().positive(),
  deliveryMethod: z.string().trim().min(1).max(255),
  itemDescription: z.string().trim().min(1),
  feeBps: z.number().int().min(0).max(10_000),
};

export const createEscrowSchema = z.object({
  role: escrowRoleSchema,
  ...termsSchema,
});

export type CreateEscrowDto = z.infer<typeof createEscrowSchema>;

export const updateEscrowTermsSchema = z.object(termsSchema);

export type UpdateEscrowTermsDto = z.infer<typeof updateEscrowTermsSchema>;

export const escrowTermsResponseSchema = z.object(termsSchema);

export type EscrowTermsResponse = z.infer<typeof escrowTermsResponseSchema>;

export const escrowPartyResponseSchema = z.object({
  userId: z.string().uuid(),
  role: escrowRoleSchema,
  termsAcceptedAt: z.coerce.date().nullable(),
});

export type EscrowPartyResponse = z.infer<typeof escrowPartyResponseSchema>;

export const escrowDetailResponseSchema = z.object({
  id: z.string().uuid(),
  state: escrowStateSchema,
  version: z.number().int(),
  terms: escrowTermsResponseSchema.nullable(),
  parties: z.array(escrowPartyResponseSchema),
  trackingReference: z.string().nullable(),
  deliveredAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type EscrowDetailResponse = z.infer<typeof escrowDetailResponseSchema>;

export const inviteResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.coerce.date(),
});

export type InviteResponse = z.infer<typeof inviteResponseSchema>;

export const escrowEventResponseSchema = z.object({
  id: z.string().uuid(),
  fromState: escrowStateSchema,
  toState: escrowStateSchema,
  actorId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export type EscrowEventResponse = z.infer<typeof escrowEventResponseSchema>;

export const invitePreviewResponseSchema = z.object({
  escrowId: z.string().uuid(),
  initiatorRole: escrowRoleSchema,
  terms: escrowTermsResponseSchema,
  evidence: z.array(evidenceItemResponseSchema),
  expiresAt: z.coerce.date(),
});

export type InvitePreviewResponse = z.infer<typeof invitePreviewResponseSchema>;
