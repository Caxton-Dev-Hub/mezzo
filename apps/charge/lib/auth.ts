'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  role: 'USER' | 'ARBITER' | 'ADMIN' | 'STAFF';
  isVerified: boolean;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
    }),
    {
      name: 'charge-auth',
      // Migration: convert old 'CUSTOMER' role to 'USER'
      migrate: (persistedState: any) => {
        if (persistedState?.user?.role === 'CUSTOMER') {
          return {
            ...persistedState,
            user: {
              ...persistedState.user,
              role: 'USER',
            },
          };
        }
        return persistedState;
      },
    },
  ),
);

export function useAuth() {
  const { token, user, setAuth, clearAuth } = useAuthStore();

  const isAuthenticated = !!token && !!user;
  const isAdmin = user?.role === 'ADMIN';
  const isStaff = user?.role === 'STAFF' || user?.role === 'ADMIN';

  return {
    token,
    user,
    isAuthenticated,
    isAdmin,
    isStaff,
    setAuth,
    logout: clearAuth,
  };
}
