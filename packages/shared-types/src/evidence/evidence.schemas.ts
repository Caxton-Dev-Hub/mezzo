import { z } from 'zod';

export const evidencePhaseSchema = z.enum(['AT_CREATION', 'AT_DELIVERY', 'CHAT']);

export type EvidencePhase = z.infer<typeof evidencePhaseSchema>;

export const evidenceFlagTypeSchema = z.enum([
  'DUPLICATE_CONTENT',
  'MISSING_METADATA',
  'TIMESTAMP_MISMATCH',
]);

export type EvidenceFlagType = z.infer<typeof evidenceFlagTypeSchema>;

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

export const ALLOWED_MIME_TYPES = [...ALLOWED_IMAGE_MIME_TYPES, ...ALLOWED_VIDEO_MIME_TYPES] as const;

const mimeTypeSchema = z.enum(ALLOWED_MIME_TYPES);

export type AllowedMimeType = z.infer<typeof mimeTypeSchema>;

export function isImageMime(mime: string): boolean {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

export const presignEvidenceSchema = z.object({
  escrowId: z.string().uuid(),
  phase: evidencePhaseSchema,
  mimeType: mimeTypeSchema,
});

export type PresignEvidenceDto = z.infer<typeof presignEvidenceSchema>;

export const confirmEvidenceSchema = z.object({
  escrowId: z.string().uuid(),
  phase: evidencePhaseSchema,
  key: z.string().min(1),
  declaredMime: mimeTypeSchema,
});

export type ConfirmEvidenceDto = z.infer<typeof confirmEvidenceSchema>;

export const presignEvidenceResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string().min(1),
});

export type PresignEvidenceResponse = z.infer<typeof presignEvidenceResponseSchema>;

export const evidenceItemResponseSchema = z.object({
  id: z.string().uuid(),
  escrowId: z.string().uuid(),
  uploaderId: z.string().uuid(),
  phase: evidencePhaseSchema,
  contentHash: z.string(),
  declaredMime: z.string(),
  detectedMime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  capturedAt: z.coerce.date().nullable(),
  deviceMake: z.string().nullable(),
  deviceModel: z.string().nullable(),
  gpsLatitude: z.number().nullable(),
  gpsLongitude: z.number().nullable(),
  flags: z.array(evidenceFlagTypeSchema),
  url: z.string().url().optional(),
  createdAt: z.coerce.date(),
});

export type EvidenceItemResponse = z.infer<typeof evidenceItemResponseSchema>;

export const evidenceBundleResponseSchema = z.object({
  escrowId: z.string().uuid(),
  items: z.array(evidenceItemResponseSchema),
});

export type EvidenceBundleResponse = z.infer<typeof evidenceBundleResponseSchema>;
