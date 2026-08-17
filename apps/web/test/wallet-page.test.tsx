import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { KycTier, PayoutResponse } from '@mezzo/shared-types';
import WalletPage from '../app/(app)/wallet/page';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

const USER_ID = 'user-id';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function makePayout(status: PayoutResponse['status'], amount: number): PayoutResponse {
  return {
    id: `payout-${status}`,
    sellerId: USER_ID,
    amount,
    currency: 'NGN',
    status,
    reference: `ref-${status}`,
    createdAt: new Date('2026-07-01T10:00:00Z'),
  };
}

function stubFetch(
  options: {
    tier?: KycTier;
    payouts?: PayoutResponse[];
    onSubmitKyc?: () => Response;
    onRequestPayout?: () => Response;
    verificationEnabled?: boolean;
  } = {},
) {
  const {
    tier = 'TIER_1',
    payouts = [],
    onSubmitKyc,
    onRequestPayout,
    verificationEnabled = true,
  } = options;
  const requested: PayoutResponse[] = [];

  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.endsWith('/wallet')) {
      return jsonResponse({
        available: { amount: 250_000, currency: 'NGN' },
        pending: { amount: 75_000, currency: 'NGN' },
        heldInEscrow: { amount: 900_000, currency: 'NGN' },
      });
    }
    if (url.endsWith('/wallet/activity')) {
      return jsonResponse([
        {
          id: 'activity-1',
          kind: 'ESCROW_RELEASE',
          direction: 'IN',
          amount: { amount: 250_000, currency: 'NGN' },
          escrowId: '11111111-1111-4111-8111-111111111111',
          occurredAt: new Date('2026-07-02T09:00:00Z'),
        },
      ]);
    }
    if (url.endsWith('/payouts')) {
      if (init?.method === 'POST') {
        if (onRequestPayout) {
          return onRequestPayout();
        }
        const payout = makePayout('PENDING', 50_000);
        requested.push(payout);
        return jsonResponse(payout, 201);
      }
      return jsonResponse([...requested, ...payouts]);
    }
    if (url.endsWith('/kyc/submissions')) {
      return onSubmitKyc
        ? onSubmitKyc()
        : jsonResponse(
            {
              id: 'verification-1',
              status: 'PENDING',
              requestedTier: 'TIER_1',
              providerReference: 'provider-ref',
              createdAt: new Date().toISOString(),
            },
            201,
          );
    }
    return jsonResponse({ tier, latestVerification: null, verificationEnabled });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('WalletPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'token',
      user: {
        id: USER_ID,
        email: 'seller@example.com',
        role: 'USER',
        emailVerified: true,
        createdAt: new Date(),
      },
    });
  });

  it('renders available, pending, and held-in-escrow as three separate balances', async () => {
    stubFetch();
    renderWithProviders(<WalletPage />);

    const available = await screen.findByRole('region', { name: 'Available' });
    const pending = screen.getByRole('region', { name: 'Pending' });
    const held = screen.getByRole('region', { name: 'Held in escrow' });

    expect(within(available).getByText(/2,500\.00/)).toBeInTheDocument();
    expect(within(pending).getByText(/750\.00/)).toBeInTheDocument();
    expect(within(held).getByText(/9,000\.00/)).toBeInTheDocument();
  });

  it('lists ledger activity in human terms', async () => {
    stubFetch();
    renderWithProviders(<WalletPage />);

    expect(await screen.findByText('Received a release from escrow')).toBeInTheDocument();
  });

  it('shows a requested payout as pending until it is confirmed', async () => {
    stubFetch({ payouts: [makePayout('PENDING', 50_000), makePayout('CONFIRMED', 30_000)] });
    renderWithProviders(<WalletPage />);

    expect(await screen.findByText('Pending confirmation')).toBeInTheDocument();
    expect(screen.getByText('Paid out')).toBeInTheDocument();
  });

  it('lets a sub-tier user withdraw while verification is set to coming soon', async () => {
    stubFetch({ tier: 'TIER_0', verificationEnabled: false });
    renderWithProviders(<WalletPage />);

    expect(await screen.findByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Verify now' })).not.toBeInTheDocument();
  });

  it('blocks a sub-tier user from withdrawing and offers a verify path', async () => {
    stubFetch({ tier: 'TIER_0' });
    renderWithProviders(<WalletPage />);

    expect(await screen.findByRole('link', { name: 'Verify now' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
  });

  it('links to the manual verification flow rather than dead-ending the blocked user', async () => {
    stubFetch({ tier: 'TIER_0' });
    renderWithProviders(<WalletPage />);

    expect(await screen.findByRole('link', { name: 'Verify now' })).toHaveAttribute(
      'href',
      '/kyc/verify?tier=TIER_1',
    );
  });

  it('lets a verified user request a payout, which lands as pending', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();

    renderWithProviders(<WalletPage />);
    await user.click(await screen.findByRole('button', { name: 'Withdraw' }));

    await user.type(screen.getByLabelText('Amount'), '500.00');
    await user.type(screen.getByLabelText('Account number'), '0123456789');
    await user.type(screen.getByLabelText('Bank code'), '058');
    await user.click(screen.getByRole('button', { name: 'Request payout' }));

    expect(await screen.findByText('Pending confirmation')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('refuses a payout larger than the available balance before calling the API', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();

    renderWithProviders(<WalletPage />);
    await user.click(await screen.findByRole('button', { name: 'Withdraw' }));

    await user.type(screen.getByLabelText('Amount'), '9999999.00');
    await user.type(screen.getByLabelText('Account number'), '0123456789');
    await user.type(screen.getByLabelText('Bank code'), '058');
    await user.click(screen.getByRole('button', { name: 'Request payout' }));

    expect(await screen.findByText(/you can withdraw up to/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          input.toString().endsWith('/payouts') &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false);
  });
});
