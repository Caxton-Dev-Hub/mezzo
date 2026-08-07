import { useMutation } from '@tanstack/react-query';
import type { ForgotPasswordDto } from '@mezzo/shared-types';
import { forgotPasswordRequest } from '../lib/auth-client';

export function useForgotPassword() {
  return useMutation({
    mutationFn: (dto: ForgotPasswordDto) => forgotPasswordRequest(dto),
  });
}
