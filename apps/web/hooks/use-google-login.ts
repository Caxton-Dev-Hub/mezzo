import { useMutation } from '@tanstack/react-query';
import type { GoogleLoginDto } from '@mezzo/shared-types';
import { googleLoginRequest } from '../lib/auth-client';
import { useAuthStore } from '../lib/auth-store';

export function useGoogleLogin() {
  const setSession = useAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: (dto: GoogleLoginDto) => googleLoginRequest(dto),
    onSuccess: (result) => {
      setSession(result.accessToken, result.user);
    },
  });
}
