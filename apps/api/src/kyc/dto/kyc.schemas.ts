import { z } from 'zod';
import { KycTier } from '../entities/kyc-tier.enum';

export const submitKycSchema = z.object({
  tier: z
    .nativeEnum(KycTier)
    .refine((tier): tier is Exclude<KycTier, KycTier.TIER_0> => tier !== KycTier.TIER_0, {
      message: 'Cannot submit a KYC application for TIER_0',
    }),
});

export type SubmitKycDto = z.infer<typeof submitKycSchema>;

export const kycWebhookSchema = z.object({
  providerReference: z.string().min(1),
  status: z.enum(['APPROVED', 'REJECTED', 'EXPIRED']),
});

export type KycWebhookDto = z.infer<typeof kycWebhookSchema>;
