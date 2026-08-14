import { z } from 'zod';
import { KycTier } from '../../kyc/entities/kyc-tier.enum';

export const postAdjustmentSchema = z.object({
  debitAccountRef: z.string().min(1),
  creditAccountRef: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.enum(['NGN', 'USD']),
  reason: z.string().trim().min(1).max(2000),
});

export type PostAdjustmentDto = z.infer<typeof postAdjustmentSchema>;

export const overrideKycTierSchema = z.object({
  tier: z.nativeEnum(KycTier),
  reason: z.string().trim().min(1).max(2000),
});

export type OverrideKycTierDto = z.infer<typeof overrideKycTierSchema>;

export const updateWhatsappTransactionalEnabledSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().min(1).max(2000),
});

export type UpdateWhatsappTransactionalEnabledDto = z.infer<
  typeof updateWhatsappTransactionalEnabledSchema
>;
