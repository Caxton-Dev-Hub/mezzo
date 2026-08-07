import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetPasswordForm } from '../components/auth/reset-password-form';
import { renderWithProviders } from './render-with-providers';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('blocks submission for a password shorter than the shared schema allows', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordForm token="reset-token" />);

    await user.type(screen.getByLabelText('New password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));

    expect(await screen.findByText(/at least 8/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the token from the link with the new password and returns to sign in', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordForm token="reset-token" />);

    await user.type(screen.getByLabelText('New password'), 'a-brand-new-password');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?reset=1'));

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/auth/reset-password');
    expect(JSON.parse(init.body as string)).toEqual({
      token: 'reset-token',
      password: 'a-brand-new-password',
    });
  });

  it('surfaces an expired or already-used token without navigating away', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              statusCode: 400,
              code: 'INVALID_PASSWORD_RESET_TOKEN',
              message: 'This password reset link is invalid or has expired',
            }),
            { status: 400 },
          ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordForm token="stale-token" />);

    await user.type(screen.getByLabelText('New password'), 'a-brand-new-password');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));

    expect(
      await screen.findByText('This password reset link is invalid or has expired'),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
