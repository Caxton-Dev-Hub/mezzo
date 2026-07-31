import { ProfileResponse, PublicProfileResponse } from '@mezzo/shared-types';
import { User } from '../../database/entities/user.entity';

export type { ProfileResponse, PublicProfileResponse };

export function toPublicProfileResponse(
  user: User,
  completedEscrows: number,
  avatarUrl: string | null,
): PublicProfileResponse {
  return {
    id: user.id,
    businessName: user.businessName,
    bio: user.bio,
    location: user.location,
    avatarUrl,
    kycTier: user.kycTier,
    completedEscrows,
    memberSince: user.createdAt,
  };
}

export function toProfileResponse(
  user: User,
  completedEscrows: number,
  avatarUrl: string | null,
): ProfileResponse {
  return {
    ...toPublicProfileResponse(user, completedEscrows, avatarUrl),
    email: user.email,
    role: user.role,
  };
}
