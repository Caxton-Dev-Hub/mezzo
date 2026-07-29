import { create } from 'zustand';
import type { UserResponse } from '@mezzo/shared-types';

export type SessionStatus = 'pending' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: SessionStatus;
  accessToken: string | null;
  user: UserResponse | null;
  setSession: (accessToken: string, user: UserResponse) => void;
  setAccessToken: (accessToken: string) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'pending',
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => set({ status: 'authenticated', accessToken, user }),
  setAccessToken: (accessToken) => set({ status: 'authenticated', accessToken }),
  clearSession: () => set({ status: 'unauthenticated', accessToken: null, user: null }),
}));
