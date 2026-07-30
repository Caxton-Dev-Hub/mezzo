import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import EscrowDetailPage from '../app/(app)/escrow/[id]/page';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'escrow-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(),
    emit: vi.fn(),
    io: { on: vi.fn() },
    close: vi.fn(),
  }),
}));

const BUYER_ID = 'buyer-id';
const SELLER_ID = 'seller-id';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(overrides: { state?: string } = {}) {
  const escrowBody = {
    id: 'escrow-1',
    state: overrides.state ?? 'AGREED',
    version: 1,
    terms: {
      price: { amount: 100_000, currency: 'NGN' },
      inspectionWindowHours: 48,
      deliveryMethod: 'courier',
      itemDescription: 'A vintage camera',
      feeBps: 250,
    },
    parties: [
      { userId: BUYER_ID, role: 'BUYER', termsAcceptedAt: new Date().toISOString() },
      { userId: SELLER_ID, role: 'SELLER', termsAcceptedAt: new Date().toISOString() },
    ],
    trackingReference: null,
    deliveredAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url.includes('/events')) {
        return jsonResponse([]);
      }
      if (url.includes('/evidence/')) {
        return jsonResponse({ escrowId: 'escrow-1', items: [] });
      }
      if (url.includes('/chat/read')) {
        return jsonResponse([]);
      }
      if (url.includes('/chat')) {
        return jsonResponse([]);
      }
      return jsonResponse(escrowBody);
    }),
  );
}

describe('EscrowDetailPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'token',
      user: { id: BUYER_ID, email: 'buyer@example.com', role: 'USER', createdAt: new Date() },
    });
  });

  it('shows the item title, current state, and frozen terms once AGREED', async () => {
    stubFetch({ state: 'AGREED' });
    renderWithProviders(<EscrowDetailPage />);

    expect(await screen.findByRole('heading', { name: 'A vintage camera' })).toBeInTheDocument();
    expect(screen.getByText('Frozen')).toBeInTheDocument();
  });

  it('does not mark terms as frozen while PENDING_COUNTERPARTY', async () => {
    stubFetch({ state: 'PENDING_COUNTERPARTY' });
    renderWithProviders(<EscrowDetailPage />);

    await screen.findByRole('heading', { name: 'A vintage camera' });
    expect(screen.queryByText('Frozen')).not.toBeInTheDocument();
  });

  it('shows a friendly message when the escrow cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { statusCode: 403, code: 'NOT_ESCROW_PARTY', message: 'You are not a party to this escrow' },
          403,
        ),
      ),
    );

    renderWithProviders(<EscrowDetailPage />);

    expect(await screen.findByText('You are not a party to this escrow')).toBeInTheDocument();
  });
});
