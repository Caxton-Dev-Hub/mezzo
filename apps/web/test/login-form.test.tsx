import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '../components/auth/login-form';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    push.mockClear();
    useAuthStore.setState({ status: 'pending', accessToken: null, user: null });
  });

  it('blocks submission and shows field errors for empty input', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stores the session and redirects to the dashboard on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            accessToken: 'access-token',
            user: { id: '1', email: 'buyer@example.com', role: 'USER', createdAt: new Date().toISOString() },
          }),
          { status: 200 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'buyer@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-strong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().accessToken).toBe('access-token');
  });

  it('surfaces invalid-credentials errors from the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            statusCode: 401,
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password.',
          }),
          { status: 401 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'buyer@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('pending');
  });
});
