import { z } from 'zod';

export const kycTierSchema = z.enum(['TIER_0', 'TIER_1', 'TIER_2', 'TIER_3']);

export type KycTier = z.infer<typeof kycTierSchema>;

export const kycVerificationStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);

export type KycVerificationStatus = z.infer<typeof kycVerificationStatusSchema>;

export const submitKycSchema = z.object({
  tier: kycTierSchema.exclude(['TIER_0']),
});

export type SubmitKycDto = z.infer<typeof submitKycSchema>;

export const kycVerificationResponseSchema = z.object({
  id: z.string().uuid(),
  status: kycVerificationStatusSchema,
  requestedTier: kycTierSchema,
  providerReference: z.string().min(1),
  createdAt: z.coerce.date(),
});

export type KycVerificationResponse = z.infer<typeof kycVerificationResponseSchema>;

export const kycStatusResponseSchema = z.object({
  tier: kycTierSchema,
  latestVerification: kycVerificationResponseSchema.nullable(),
  verificationEnabled: z.boolean(),
});

export type KycStatusResponse = z.infer<typeof kycStatusResponseSchema>;
