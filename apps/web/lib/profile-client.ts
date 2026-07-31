import type {
  ConfirmAvatarDto,
  PresignAvatarDto,
  PresignAvatarResponse,
  ProfileResponse,
  PublicProfileResponse,
  UpdateProfileDto,
} from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function getOwnProfile(): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>('/profiles/me');
}

export function getPublicProfile(userId: string): Promise<PublicProfileResponse> {
  return apiRequest<PublicProfileResponse>(`/profiles/${userId}`);
}

export function updateProfile(dto: UpdateProfileDto): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>('/profiles/me', { method: 'PATCH', body: dto });
}

export function presignAvatar(dto: PresignAvatarDto): Promise<PresignAvatarResponse> {
  return apiRequest<PresignAvatarResponse>('/profiles/me/avatar/presign', {
    method: 'POST',
    body: dto,
  });
}

export function confirmAvatar(dto: ConfirmAvatarDto): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>('/profiles/me/avatar', { method: 'POST', body: dto });
}
