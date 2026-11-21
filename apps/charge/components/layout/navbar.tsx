'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LogOut, Wallet, User, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';

export function Navbar() {
  const router = useRouter();
  const { user, isStaff, isAdmin, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  return (
    <nav className="border-b border-line bg-surface/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="hover:opacity-80 transition-opacity flex-shrink-0">
            <Image src="/mezzo-mark.svg" alt="Mezzo Charge" width={100} height={32} className="h-8" />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
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
            <Link
              href="/profile"
              className="text-sm font-medium hover:text-mint transition-colors flex items-center gap-2"
            >
              <User className="w-4 h-4" />
              Profile
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

          {/* Mobile Menu Button */}
          <button
            onClick={toggleMenu}
            className="md:hidden p-2 hover:bg-surface rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {isOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden mt-4 pb-4 space-y-3 border-t border-line pt-4">
            <Link
              href="/dashboard"
              onClick={closeMenu}
              className="block text-sm font-medium hover:text-mint transition-colors py-2"
            >
              Dashboard
            </Link>
            <Link
              href="/wallet"
              onClick={closeMenu}
              className="block text-sm font-medium hover:text-mint transition-colors py-2 flex items-center gap-2"
            >
              <Wallet className="w-4 h-4" />
              Wallet
            </Link>
            <Link
              href="/profile"
              onClick={closeMenu}
              className="block text-sm font-medium hover:text-mint transition-colors py-2 flex items-center gap-2"
            >
              <User className="w-4 h-4" />
              Profile
            </Link>
            {isStaff && (
              <Link
                href="/staff"
                onClick={closeMenu}
                className="block text-sm font-medium hover:text-mint transition-colors py-2"
              >
                Staff
              </Link>
            )}
            {isAdmin && (
              <>
                <Link
                  href="/admin"
                  onClick={closeMenu}
                  className="block text-sm font-medium hover:text-mint transition-colors py-2"
                >
                  Admin
                </Link>
                <Link
                  href="/admin/powerbanks"
                  onClick={closeMenu}
                  className="block text-sm font-medium hover:text-mint transition-colors py-2"
                >
                  Powerbanks
                </Link>
                <Link
                  href="/admin/shops"
                  onClick={closeMenu}
                  className="block text-sm font-medium hover:text-mint transition-colors py-2"
                >
                  Shops & Staff
                </Link>
              </>
            )}
            <div className="border-t border-line pt-3 mt-3 space-y-3">
              <span className="block text-sm text-fog flex items-center gap-2">
                <User className="w-4 h-4" />
                {user?.email}
              </span>
              <button
                onClick={() => {
                  handleLogout();
                  closeMenu();
                }}
                className="block w-full text-left text-sm font-medium text-danger hover:text-danger-deep transition-colors py-2 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Log out
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
