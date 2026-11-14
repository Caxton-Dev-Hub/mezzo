'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Wallet, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export function Navbar() {
  const router = useRouter();
  const { user, isStaff, isAdmin, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <nav className="border-b border-line bg-surface/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="font-display text-2xl hover:text-mint transition-colors">
            Mezzo Charge
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm font-medium hover:text-mint transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/wallet"
              className="text-sm font-medium hover:text-mint transition-colors flex items-center gap-2"
            >
              <Wallet className="w-4 h-4" />
              Wallet
            </Link>
            {isStaff && (
              <Link
                href="/staff"
                className="text-sm font-medium hover:text-mint transition-colors"
              >
                Staff
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className="text-sm font-medium hover:text-mint transition-colors"
              >
                Admin
              </Link>
            )}
            <div className="flex items-center gap-3 pl-3 border-l border-line">
              <span className="text-sm text-fog flex items-center gap-2">
                <User className="w-4 h-4" />
                {user?.email}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-danger hover:text-danger-deep transition-colors flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Log out
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
