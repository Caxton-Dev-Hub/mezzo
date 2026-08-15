import type { JoinWaitlistDto, WaitlistSignupResponse } from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function joinWaitlist(dto: JoinWaitlistDto): Promise<WaitlistSignupResponse> {
  return apiRequest<WaitlistSignupResponse>('/waitlist', {
    method: 'POST',
    body: dto,
    skipAuth: true,
  });
}
