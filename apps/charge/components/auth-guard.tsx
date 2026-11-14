'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireStaff?: boolean;
}

export function AuthGuard({ children, requireAdmin, requireStaff }: AuthGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isAdmin, isStaff } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (requireAdmin && !isAdmin) {
      router.push('/dashboard');
      return;
    }

    if (requireStaff && !isStaff) {
      router.push('/dashboard');
      return;
    }
  }, [isAuthenticated, isAdmin, isStaff, requireAdmin, requireStaff, router]);

  if (!isAuthenticated) {
    return null;
  }

  if (requireAdmin && !isAdmin) {
    return null;
  }

  if (requireStaff && !isStaff) {
    return null;
  }

  return <>{children}</>;
}
