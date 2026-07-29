'use client';

import { useAuthStore } from '../../lib/auth-store';
import { useLogout } from '../../hooks/use-logout';
import { Wordmark } from './wordmark';
import { Button } from '../ui/button';

export function AppShell({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line-soft">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-5 sm:px-8">
          <Wordmark />
          <div className="flex items-center gap-3 sm:gap-4">
            {status === 'pending' ? (
              <span className="hidden h-4 w-32 animate-pulse rounded bg-surface-2 sm:block" />
            ) : status === 'authenticated' && user ? (
              <span className="hidden truncate text-sm text-fog sm:block">{user.email}</span>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => logout.mutate()}
              loading={logout.isPending}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8 sm:px-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
