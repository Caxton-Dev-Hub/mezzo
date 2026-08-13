'use client';

import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../lib/auth-store';
import { AdminNav } from '../../../components/admin/admin-nav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.user?.role);

  if (status === 'pending') {
    return <div className="h-40 animate-pulse rounded-xl bg-surface-2" />;
  }

  if (role !== 'ARBITER' && role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <ShieldAlert className="h-6 w-6 text-mute" />
        <p className="mt-3 text-sm text-vellum">This area is for arbiters only.</p>
        <p className="mt-1 text-[13px] text-mute">
          Your account does not have arbiter access. If that is wrong, contact an administrator.
        </p>
      </div>
    );
  }

  return (
    <>
      <AdminNav isAdmin={role === 'ADMIN'} />
      {children}
    </>
  );
}
