'use client';

import Link from 'next/link';
import Image from 'next/image';
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
          <Link href="/dashboard" className="hover:opacity-80 transition-opacity">
            <Image src="/mezzo-mark.svg" alt="Mezzo Charge" width={100} height={32} className="h-8" />
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
              <>
                <Link
                  href="/admin"
                  className="text-sm font-medium hover:text-mint transition-colors"
                >
                  Admin
                </Link>
                <Link
                  href="/admin/powerbanks"
                  className="text-sm font-medium hover:text-mint transition-colors"
                >
                  Powerbanks
                </Link>
                <Link
                  href="/admin/shops"
                  className="text-sm font-medium hover:text-mint transition-colors"
                >
                  Shops & Staff
                </Link>
              </>
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
