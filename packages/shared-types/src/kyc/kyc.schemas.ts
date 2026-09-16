import { z } from 'zod';
import { ALLOWED_IMAGE_MIME_TYPES } from '../evidence/evidence.schemas';

const kycDocumentMimeTypeSchema = z.enum(ALLOWED_IMAGE_MIME_TYPES);

export const kycTierSchema = z.enum(['TIER_0', 'TIER_1', 'TIER_2', 'TIER_3']);

export type KycTier = z.infer<typeof kycTierSchema>;

export const kycVerificationStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);

export type KycVerificationStatus = z.infer<typeof kycVerificationStatusSchema>;

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

export const kycDocumentTypeSchema = z.enum(['GOVERNMENT_ID', 'SELFIE', 'PROOF_OF_ADDRESS']);

export type KycDocumentType = z.infer<typeof kycDocumentTypeSchema>;

export const presignKycDocumentSchema = z.object({
  documentType: kycDocumentTypeSchema,
  mimeType: kycDocumentMimeTypeSchema,
});

export type PresignKycDocumentDto = z.infer<typeof presignKycDocumentSchema>;

export const presignKycDocumentResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string().min(1),
});

export type PresignKycDocumentResponse = z.infer<typeof presignKycDocumentResponseSchema>;

export const confirmKycDocumentSchema = z.object({
  key: z.string().min(1),
  documentType: kycDocumentTypeSchema,
  declaredMime: kycDocumentMimeTypeSchema,
});

export type ConfirmKycDocumentDto = z.infer<typeof confirmKycDocumentSchema>;

export const kycDocumentResponseSchema = z.object({
  id: z.string().uuid(),
  documentType: kycDocumentTypeSchema,
  declaredMime: z.string(),
  detectedMime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  url: z.string().url().optional(),
  createdAt: z.coerce.date(),
});

export type KycDocumentResponse = z.infer<typeof kycDocumentResponseSchema>;

export const submitManualKycSchema = z.object({
  tier: kycTierSchema.exclude(['TIER_0']),
  documentIds: z.array(z.string().uuid()).min(1),
});

export type SubmitManualKycDto = z.infer<typeof submitManualKycSchema>;

export const reviewKycVerificationSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export type ReviewKycVerificationDto = z.infer<typeof reviewKycVerificationSchema>;
