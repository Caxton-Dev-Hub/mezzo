import type { WaitlistSignupResponse } from '@mezzo/shared-types';
import { WaitlistSignup } from '../../database/entities/waitlist-signup.entity';

export type { WaitlistSignupResponse };

export function toWaitlistSignupResponse(signup: WaitlistSignup): WaitlistSignupResponse {
  return {
    email: signup.email,
    createdAt: signup.createdAt,
  };
}
