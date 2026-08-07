import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordForm } from '../components/auth/forgot-password-form';
import { renderWithProviders } from './render-with-providers';

describe('ForgotPasswordForm', () => {
  it('blocks submission and shows a field error for an invalid email', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('replaces the form with a neutral confirmation that does not reveal whether the account exists', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));

    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'buyer@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'If that email has a Mezzo account, a reset link is on its way.',
    );
    expect(screen.queryByRole('button', { name: 'Send reset link' })).not.toBeInTheDocument();
  });

  it('surfaces a rate-limit error from the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              statusCode: 429,
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many attempts. Try again shortly.',
            }),
            { status: 429 },
          ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'buyer@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText('Too many attempts. Try again shortly.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
