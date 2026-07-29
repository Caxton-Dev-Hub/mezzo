import { useMutation } from '@tanstack/react-query';
import type { LoginDto } from '@mezzo/shared-types';
import { loginRequest } from '../lib/auth-client';
import { useAuthStore } from '../lib/auth-store';

export function useLogin() {
  const setSession = useAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: (dto: LoginDto) => loginRequest(dto),
    onSuccess: (result) => {
      setSession(result.accessToken, result.user);
    },
  });
}
