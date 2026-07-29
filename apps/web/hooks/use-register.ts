import { useMutation } from '@tanstack/react-query';
import type { RegisterDto } from '@mezzo/shared-types';
import { registerRequest } from '../lib/auth-client';

export function useRegister() {
  return useMutation({
    mutationFn: (dto: RegisterDto) => registerRequest(dto),
  });
}
