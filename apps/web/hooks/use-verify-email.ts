import { useMutation } from '@tanstack/react-query';
import type { VerifyEmailDto } from '@mezzo/shared-types';
import { verifyEmailRequest } from '../lib/auth-client';

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (dto: VerifyEmailDto) => verifyEmailRequest(dto),
  });
}
