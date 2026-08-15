import { useMutation } from '@tanstack/react-query';
import type { ResendVerificationDto } from '@mezzo/shared-types';
import { resendVerificationRequest } from '../lib/auth-client';

export function useResendVerification() {
  return useMutation({
    mutationFn: (dto: ResendVerificationDto) => resendVerificationRequest(dto),
  });
}
