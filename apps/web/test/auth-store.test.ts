import { beforeEach, describe, expect, it } from 'vitest';
import type { UserResponse } from '@mezzo/shared-types';
import { useAuthStore } from '@/lib/auth-store';

const user = { id: 'user-1', email: 'buyer@example.com' } as UserResponse;

beforeEach(() => {
  useAuthStore.setState({ status: 'pending', accessToken: null, user: null });
});

describe('useAuthStore', () => {
  it('starts pending so the shell can wait before redirecting', () => {
    const state = useAuthStore.getState();

    expect(state.status).toBe('pending');
    expect(state.accessToken).toBeNull();
    expect(state.user).toBeNull();
  });

  it('records the token and user on sign-in', () => {
    useAuthStore.getState().setSession('access-token', user);

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.accessToken).toBe('access-token');
    expect(state.user).toEqual(user);
  });

  it('swaps in a refreshed token without losing the user', () => {
    useAuthStore.getState().setSession('old-token', user);

    useAuthStore.getState().setAccessToken('new-token');

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('new-token');
    expect(state.user).toEqual(user);
    expect(state.status).toBe('authenticated');
  });

  it('clears the token and user on sign-out', () => {
    useAuthStore.getState().setSession('access-token', user);

    useAuthStore.getState().clearSession();

    const state = useAuthStore.getState();
    expect(state.status).toBe('unauthenticated');
    expect(state.accessToken).toBeNull();
    expect(state.user).toBeNull();
  });

  it('moves out of pending once a silent refresh fails', () => {
    useAuthStore.getState().clearSession();

    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });
});
