'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from './auth-store';
import { refreshRequest } from './auth-client';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) {
      return;
    }
    attempted.current = true;

    refreshRequest()
      .then((result) => {
        useAuthStore.getState().setSession(result.accessToken, result.user);
      })
      .catch(() => {
        useAuthStore.getState().clearSession();
      });
  }, []);

  return children;
}
