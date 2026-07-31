import { z } from 'zod';
import { kycTierSchema } from '../kyc';
import { userRoleSchema } from '../users';
import { ALLOWED_IMAGE_MIME_TYPES } from '../evidence';

export const avatarMimeTypeSchema = z.enum(ALLOWED_IMAGE_MIME_TYPES);

export type AvatarMimeType = z.infer<typeof avatarMimeTypeSchema>;

export const BUSINESS_NAME_MAX_LENGTH = 80;
export const BIO_MAX_LENGTH = 280;
export const LOCATION_MAX_LENGTH = 80;

function nullableText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === null || value.length === 0 ? null : value));
}

export const updateProfileSchema = z.object({
  businessName: nullableText(BUSINESS_NAME_MAX_LENGTH),
  bio: nullableText(BIO_MAX_LENGTH),
  location: nullableText(LOCATION_MAX_LENGTH),
});

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export const publicProfileResponseSchema = z.object({
  id: z.string().uuid(),
  businessName: z.string().nullable(),
  bio: z.string().nullable(),
  location: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  kycTier: kycTierSchema,
  completedEscrows: z.number().int().nonnegative(),
  memberSince: z.coerce.date(),
});

export type PublicProfileResponse = z.infer<typeof publicProfileResponseSchema>;

export const profileResponseSchema = publicProfileResponseSchema.extend({
  email: z.string().email(),
  role: userRoleSchema,
});

export type ProfileResponse = z.infer<typeof profileResponseSchema>;

export const presignAvatarSchema = z.object({
  mimeType: avatarMimeTypeSchema,
});

export type PresignAvatarDto = z.infer<typeof presignAvatarSchema>;

export const presignAvatarResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string().min(1),
});

export type PresignAvatarResponse = z.infer<typeof presignAvatarResponseSchema>;

export const confirmAvatarSchema = z.object({
  key: z.string().min(1),
  declaredMime: avatarMimeTypeSchema,
});

export type ConfirmAvatarDto = z.infer<typeof confirmAvatarSchema>;
