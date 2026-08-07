import { useMutation } from '@tanstack/react-query';
import type { ResetPasswordDto } from '@mezzo/shared-types';
import { resetPasswordRequest } from '../lib/auth-client';

export function useResetPassword() {
  return useMutation({
    mutationFn: (dto: ResetPasswordDto) => resetPasswordRequest(dto),
  });
}
