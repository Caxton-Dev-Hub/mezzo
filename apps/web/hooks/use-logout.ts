import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { logoutRequest } from '../lib/auth-client';
import { useAuthStore } from '../lib/auth-store';

export function useLogout() {
  const clearSession = useAuthStore((state) => state.clearSession);
  const router = useRouter();

  return useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      clearSession();
      router.push('/login');
    },
  });
}
