import { z } from 'zod';
import { EvidencePhase } from '../entities/evidence-phase.enum';
import { ALLOWED_MIME_TYPES } from '../allowed-media-types';

const mimeTypeSchema = z.string().refine((value) => ALLOWED_MIME_TYPES.has(value), {
  message: 'Unsupported media type',
});

export const presignEvidenceSchema = z.object({
  escrowId: z.string().uuid(),
  phase: z.nativeEnum(EvidencePhase),
  mimeType: mimeTypeSchema,
});

export type PresignEvidenceDto = z.infer<typeof presignEvidenceSchema>;

export const confirmEvidenceSchema = z.object({
  escrowId: z.string().uuid(),
  phase: z.nativeEnum(EvidencePhase),
  key: z.string().min(1),
  declaredMime: mimeTypeSchema,
});

export type ConfirmEvidenceDto = z.infer<typeof confirmEvidenceSchema>;
