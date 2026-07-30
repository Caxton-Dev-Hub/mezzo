import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvitePreviewPage from '../app/invite/[token]/page';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'the-token' }),
  useRouter: () => ({ push }),
}));

const previewBody = {
  escrowId: 'escrow-1',
  initiatorRole: 'BUYER',
  terms: {
    price: { amount: 100_000, currency: 'NGN' },
    inspectionWindowHours: 48,
    deliveryMethod: 'courier',
    itemDescription: 'A vintage camera',
    feeBps: 250,
    requiresVerification: false,
    agreementText: null,
  },
  evidence: [],
  expiresAt: new Date().toISOString(),
};

describe('InvitePreviewPage', () => {
  beforeEach(() => {
    push.mockClear();
    useAuthStore.setState({ status: 'pending', accessToken: null, user: null });
  });

  it('shows a clear, non-alarming message for an expired or used token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            statusCode: 410,
            code: 'INVITE_NO_LONGER_VALID',
            message: 'This invite link has already been used',
          }),
          { status: 410 },
        ),
      ),
    );

    renderWithProviders(<InvitePreviewPage />);

    expect(await screen.findByText('This invite link has already been used')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept invite' })).not.toBeInTheDocument();
  });

  it('prompts an unauthenticated visitor to log in or register with a redirect back to the invite', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(previewBody), { status: 200 })),
    );
    useAuthStore.setState({ status: 'unauthenticated', accessToken: null, user: null });

    renderWithProviders(<InvitePreviewPage />);

    await screen.findByText('A vintage camera');
    const loginLink = screen.getByRole('link', { name: 'Log in to accept' });
    expect(loginLink).toHaveAttribute(
      'href',
      `/login?redirectTo=${encodeURIComponent('/invite/the-token')}`,
    );
  });

  it('lets an authenticated visitor accept the invite and redirects to the escrow', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'escrow-1', state: 'PENDING_COUNTERPARTY' }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(previewBody), { status: 200 });
      }),
    );
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'token',
      user: { id: 'seller-id', email: 's@example.com', role: 'USER', createdAt: new Date() },
    });

    const user = userEvent.setup();
    renderWithProviders(<InvitePreviewPage />);

    await screen.findByText('A vintage camera');
    await user.click(screen.getByRole('button', { name: 'Accept invite' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/escrow/escrow-1'));
  });
});
