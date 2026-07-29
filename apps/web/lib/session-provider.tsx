'use client';

import { useEffect, useRef } from 'react';
import { ensureFreshSession } from './auth-client';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) {
      return;
    }
    attempted.current = true;

    void ensureFreshSession();
  }, []);

  return children;
}
