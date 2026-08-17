import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EscrowState, PaymentIntentResponse } from '@mezzo/shared-types';
import FundEscrowPage from '../app/(app)/escrow/[id]/fund/page';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'escrow-1' }),
}));

const BUYER_ID = 'buyer-id';
const SELLER_ID = 'seller-id';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function makeIntent(status: PaymentIntentResponse['status']): PaymentIntentResponse {
  return {
    id: 'intent-1',
    escrowId: 'escrow-1',
    amount: 100_000,
    currency: 'NGN',
    status,
    reference: 'ref-1',
    authorizationUrl: null,
  };
}

function stubFetch(
  options: {
    state?: EscrowState;
    intent?: PaymentIntentResponse | null;
    tier?: string;
    onFund?: () => Response;
  } = {},
) {
  const { state = 'AGREED', intent = null, tier = 'TIER_1', onFund } = options;
  let currentIntent = intent;

  const escrowBody = {
    id: 'escrow-1',
    state,
    version: 1,
    terms: {
      price: { amount: 100_000, currency: 'NGN' },
      inspectionWindowHours: 48,
      deliveryMethod: 'courier',
      itemDescription: 'A vintage camera',
      feeBps: 250,
      requiresVerification: false,
      agreementText: null,
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

  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.includes('/payments/escrows/')) {
      if (init?.method === 'POST') {
        if (onFund) {
          return onFund();
        }
        currentIntent = makeIntent('PENDING');
        return jsonResponse(currentIntent, 201);
      }
      return jsonResponse({ intent: currentIntent });
    }
    if (url.includes('/kyc/me')) {
      return jsonResponse({ tier, latestVerification: null, verificationEnabled: true });
    }
    if (url.includes('/evidence/')) {
      return jsonResponse({ escrowId: 'escrow-1', items: [] });
    }
    return jsonResponse(escrowBody);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('FundEscrowPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'token',
      user: {
        id: BUYER_ID,
        email: 'buyer@example.com',
        role: 'USER',
        emailVerified: true,
        createdAt: new Date(),
      },
    });
  });

  it('offers the buyer a funding action on an AGREED escrow with no payment started', async () => {
    stubFetch({ state: 'AGREED', intent: null });
    renderWithProviders(<FundEscrowPage />);

    expect(await screen.findByRole('button', { name: /^Fund/ })).toBeInTheDocument();
  });

  it('shows a confirming state — not funded — while a payment intent is still pending', async () => {
    stubFetch({ state: 'AGREED', intent: makeIntent('PENDING') });
    renderWithProviders(<FundEscrowPage />);

    expect(await screen.findByText(/confirming payment/i)).toBeInTheDocument();
    expect(screen.queryByText(/payment confirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Fund/ })).not.toBeInTheDocument();
  });

  it('does not report the escrow funded when checkout returns but no webhook has landed', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('location', { assign: vi.fn() });
    stubFetch({ state: 'AGREED', intent: null });

    renderWithProviders(<FundEscrowPage />);
    await user.click(await screen.findByRole('button', { name: /^Fund/ }));

    await waitFor(() => expect(screen.getByText(/confirming payment/i)).toBeInTheDocument());
    expect(screen.queryByText(/payment confirmed/i)).not.toBeInTheDocument();
  });

  it('reports the escrow funded only once the API reports FUNDED', async () => {
    stubFetch({ state: 'FUNDED', intent: makeIntent('FUNDED') });
    renderWithProviders(<FundEscrowPage />);

    expect(await screen.findByText(/payment confirmed/i)).toBeInTheDocument();
  });

  it.each([['SHIPPED' as EscrowState], ['PENDING_COUNTERPARTY' as EscrowState]])(
    'refuses funding on a %s escrow',
    async (state) => {
      stubFetch({ state, intent: null });
      renderWithProviders(<FundEscrowPage />);

      expect(await screen.findByText(/funding is only available/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Fund/ })).not.toBeInTheDocument();
    },
  );

  it('lets the buyer reopen checkout for a pending intent found on page load', async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    stubFetch({
      state: 'AGREED',
      intent: makeIntent('PENDING'),
      onFund: () =>
        jsonResponse(
          { ...makeIntent('PENDING'), authorizationUrl: 'https://pay.example/checkout/reopened' },
          201,
        ),
    });

    renderWithProviders(<FundEscrowPage />);
    await user.click(await screen.findByRole('button', { name: /reopen the payment page/i }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://pay.example/checkout/reopened'),
    );
  });

  it('surfaces a quarantined payment instead of pretending it funded', async () => {
    stubFetch({ state: 'AGREED', intent: makeIntent('QUARANTINED') });
    renderWithProviders(<FundEscrowPage />);

    expect(await screen.findByText(/needs a manual check/i)).toBeInTheDocument();
    expect(screen.queryByText(/payment confirmed/i)).not.toBeInTheDocument();
  });

  it('offers an inline verification path when funding is blocked by KYC tier', async () => {
    const user = userEvent.setup();
    stubFetch({
      state: 'AGREED',
      intent: null,
      tier: 'TIER_0',
      onFund: () =>
        jsonResponse(
          {
            statusCode: 403,
            code: 'KYC_TIER_REQUIRED',
            message: 'This action requires TIER_1 verification or higher',
            details: { requiredTier: 'TIER_1' },
          },
          403,
        ),
    });

    renderWithProviders(<FundEscrowPage />);
    await user.click(await screen.findByRole('button', { name: /^Fund/ }));

    expect(await screen.findByRole('link', { name: 'Verify now' })).toBeInTheDocument();
  });

  it('tells a non-buyer they cannot fund the escrow', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'token',
      user: {
        id: SELLER_ID,
        email: 'seller@example.com',
        role: 'USER',
        emailVerified: true,
        createdAt: new Date(),
      },
    });
    stubFetch({ state: 'AGREED', intent: null });

    renderWithProviders(<FundEscrowPage />);

    expect(await screen.findByText(/only the buyer can fund/i)).toBeInTheDocument();
  });
});
