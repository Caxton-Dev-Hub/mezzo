import { z } from 'zod';

export const platformSettingsResponseSchema = z.object({
  verificationEnabled: z.boolean(),
  updatedAt: z.coerce.date().nullable(),
  updatedById: z.string().uuid().nullable(),
});

export type PlatformSettingsResponse = z.infer<typeof platformSettingsResponseSchema>;

export const updateVerificationEnabledSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().min(1).max(2000),
});

export type UpdateVerificationEnabledDto = z.infer<typeof updateVerificationEnabledSchema>;
