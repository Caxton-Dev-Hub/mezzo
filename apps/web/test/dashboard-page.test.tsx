import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { EscrowDetailResponse } from '@mezzo/shared-types';
import DashboardPage from '../app/(app)/dashboard/page';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const COUNTERPARTY_ID = '22222222-2222-4222-8222-222222222222';

function makeEscrow(
  id: string,
  overrides: Partial<EscrowDetailResponse> = {},
): EscrowDetailResponse {
  return {
    id,
    state: 'PENDING_COUNTERPARTY',
    version: 1,
    terms: {
      price: { amount: 70_000_000, currency: 'NGN' },
      inspectionWindowHours: 48,
      deliveryMethod: 'GIG',
      itemDescription: `Item ${id}`,
      feeBps: 250,
    },
    parties: [{ userId: USER_ID, role: 'BUYER', termsAcceptedAt: null }],
    trackingReference: null,
    deliveredAt: null,
    createdAt: new Date('2026-07-30T10:51:00Z'),
    updatedAt: new Date('2026-07-30T10:51:00Z'),
    ...overrides,
  };
}

function stubEscrows(escrows: EscrowDetailResponse[] | { status: number }) {
  const fetchMock = vi.fn(async () => {
    if (!Array.isArray(escrows)) {
      return new Response(
        JSON.stringify({ statusCode: escrows.status, code: 'SERVER_ERROR', message: 'Boom' }),
        { status: escrows.status },
      );
    }
    return new Response(JSON.stringify(escrows), { status: 200 });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'token',
      user: { id: USER_ID, email: 'buyer@example.com', role: 'USER', createdAt: new Date() },
    });
  });

  it('lists the escrows the user is a party to', async () => {
    stubEscrows([
      makeEscrow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      makeEscrow('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', {
        state: 'AGREED',
        parties: [
          { userId: COUNTERPARTY_ID, role: 'BUYER', termsAcceptedAt: null },
          { userId: USER_ID, role: 'SELLER', termsAcceptedAt: null },
        ],
      }),
    ]);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Item aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBeInTheDocument();
    });
    expect(screen.getByText('Item bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).toBeInTheDocument();
    expect(screen.queryByText('No escrows yet')).not.toBeInTheDocument();
  });

  it('links each escrow to its detail page and shows the caller’s own role', async () => {
    stubEscrows([makeEscrow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')]);

    renderWithProviders(<DashboardPage />);

    const link = await screen.findByRole('link', {
      name: /Item aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/,
    });
    expect(link).toHaveAttribute('href', '/escrow/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(link).toHaveTextContent('Waiting for counterparty');
    expect(link).toHaveTextContent('You are buying');
  });

  it('falls back to the empty state only when the user really has no escrows', async () => {
    stubEscrows([]);

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('No escrows yet')).toBeInTheDocument();
  });

  it('surfaces a retry affordance when the list cannot be loaded', async () => {
    stubEscrows({ status: 500 });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('No escrows yet')).not.toBeInTheDocument();
  });
});
