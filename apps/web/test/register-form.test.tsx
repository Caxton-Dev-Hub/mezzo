import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterForm } from '../components/auth/register-form';
import { renderWithProviders } from './render-with-providers';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('RegisterForm', () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows inline validation errors from the shared zod schema without submitting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 8 character/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('disables the submit button while the request is in flight', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'buyer@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-strong-password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('button', { name: 'Create account' })).toBeDisabled();

    resolveFetch(new Response(JSON.stringify({ id: '1' }), { status: 201 }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?registered=1'));
  });

  it('surfaces a readable server error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            statusCode: 409,
            code: 'EMAIL_ALREADY_REGISTERED',
            message: 'An account with this email already exists.',
          }),
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'buyer@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-strong-password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
