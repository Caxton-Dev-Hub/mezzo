import { UserResponse } from '@mezzo/shared-types';
import { User } from '../../database/entities/user.entity';

export type { UserResponse };

export function toUserResponse(user: User, avatarUrl: string | null = null): UserResponse {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt,
    avatarUrl,
  };
}
