import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EscrowDetailResponse, KycTier, KycVerificationResponse } from '@mezzo/shared-types';
import DashboardPage from '../app/(app)/dashboard/page';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const COUNTERPARTY_ID = '22222222-2222-4222-8222-222222222222';

function makeTerms(itemDescription: string): NonNullable<EscrowDetailResponse['terms']> {
  return {
    price: { amount: 70_000_000, currency: 'NGN' },
    inspectionWindowHours: 48,
    deliveryMethod: 'GIG',
    itemDescription,
    feeBps: 250,
    requiresVerification: false,
    agreementText: null,
  };
}

function makeEscrow(
  id: string,
  overrides: Partial<EscrowDetailResponse> = {},
): EscrowDetailResponse {
  return {
    id,
    state: 'PENDING_COUNTERPARTY',
    version: 1,
    terms: makeTerms(`Item ${id}`),
    parties: [{ userId: USER_ID, role: 'BUYER', termsAcceptedAt: null }],
    trackingReference: null,
    deliveredAt: null,
    createdAt: new Date('2026-07-30T10:51:00Z'),
    updatedAt: new Date('2026-07-30T10:51:00Z'),
    ...overrides,
  };
}

function stubEscrows(
  escrows: EscrowDetailResponse[] | { status: number },
  kyc: {
    tier: KycTier;
    latestVerification?: KycVerificationResponse | null;
    verificationEnabled?: boolean;
  } = {
    tier: 'TIER_1',
  },
) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = input.toString();

    if (url.includes('/kyc/me')) {
      return new Response(
        JSON.stringify({
          tier: kyc.tier,
          latestVerification: kyc.latestVerification ?? null,
          verificationEnabled: kyc.verificationEnabled ?? true,
        }),
        { status: 200 },
      );
    }

    if (url.includes('/kyc/submissions')) {
      return new Response(
        JSON.stringify({
          id: '33333333-3333-4333-8333-333333333333',
          status: 'PENDING',
          requestedTier: 'TIER_1',
          providerReference: 'ref-1',
          createdAt: new Date('2026-07-31T10:00:00Z'),
        }),
        { status: 201 },
      );
    }

    if (!Array.isArray(escrows)) {
      return new Response(
        JSON.stringify({
          statusCode: escrows.status,
          code: 'SERVER_ERROR',
          message: 'Boom',
        }),
        { status: escrows.status },
      );
    }

    const params = new URL(url, 'http://localhost').searchParams;
    const search = params.get('search')?.toLowerCase();
    const state = params.get('state');
    const page = Number(params.get('page') ?? '1');
    const pageSize = Number(params.get('pageSize') ?? '20');

    let filtered = escrows;
    if (search) {
      filtered = filtered.filter((escrow) =>
        escrow.terms?.itemDescription.toLowerCase().includes(search),
      );
    }
    if (state) {
      filtered = filtered.filter((escrow) => escrow.state === state);
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return new Response(
      JSON.stringify({
        items,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      }),
      { status: 200 },
    );
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
      user: {
        id: USER_ID,
        email: 'buyer@example.com',
        role: 'USER',
        emailVerified: true,
        createdAt: new Date(),
      },
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

  it('keeps an unsent draft in its own section, resumable and deletable', async () => {
    stubEscrows([
      makeEscrow('cccccccc-cccc-4ccc-8ccc-cccccccccccc', { state: 'DRAFT' }),
      makeEscrow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    ]);

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('Drafts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Delete draft Item cccccccc-cccc-4ccc-8ccc-cccccccccccc/,
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole('link', {
        name: /Item cccccccc-cccc-4ccc-8ccc-cccccccccccc/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: /Item aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/,
      }),
    ).toBeInTheDocument();
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

  it('prompts an unverified user to complete verification', async () => {
    stubEscrows([], { tier: 'TIER_0' });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('Verify your identity to continue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify now' })).toBeInTheDocument();
  });

  it('starts verification from the dashboard prompt', async () => {
    const fetchMock = stubEscrows([], { tier: 'TIER_0' });

    renderWithProviders(<DashboardPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Verify now' }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => input.toString().includes('/kyc/submissions')),
      ).toBe(true);
    });
  });

  it('shows the in-review state instead of the button while verification is pending', async () => {
    stubEscrows([], {
      tier: 'TIER_0',
      latestVerification: {
        id: '33333333-3333-4333-8333-333333333333',
        status: 'PENDING',
        requestedTier: 'TIER_1',
        providerReference: 'ref-1',
        createdAt: new Date('2026-07-31T10:00:00Z'),
      } as KycVerificationResponse,
    });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText(/Your verification is in review/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify now' })).not.toBeInTheDocument();
  });

  it('drops the verification nudge entirely when an admin has verification set to coming soon', async () => {
    stubEscrows([], { tier: 'TIER_0', verificationEnabled: false });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(screen.queryByText('No escrows yet')).toBeInTheDocument());
    expect(screen.queryByText('Verify your identity to continue')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify now' })).not.toBeInTheDocument();
  });

  it('leaves a verified user’s dashboard free of the prompt', async () => {
    stubEscrows([], { tier: 'TIER_1' });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('No escrows yet')).toBeInTheDocument();
    expect(screen.queryByText('Verify your identity to continue')).not.toBeInTheDocument();
  });

  describe('search, filter, sort, and pagination', () => {
    it('debounces search input and narrows the list to matching item descriptions', async () => {
      stubEscrows([
        makeEscrow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
          terms: makeTerms('A vintage camera'),
        }),
        makeEscrow('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', {
          terms: makeTerms('A pair of sneakers'),
        }),
      ]);

      renderWithProviders(<DashboardPage />);

      await screen.findByText('A vintage camera');
      expect(screen.getByText('A pair of sneakers')).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText('Search escrows'), 'camera');

      await waitFor(
        () => {
          expect(screen.queryByText('A pair of sneakers')).not.toBeInTheDocument();
        },
        { timeout: 2000 },
      );
      expect(screen.getByText('A vintage camera')).toBeInTheDocument();
    });

    it('filters by status and sends the state in the request', async () => {
      const fetchMock = stubEscrows([
        makeEscrow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { state: 'FUNDED' }),
        makeEscrow('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { state: 'SHIPPED' }),
      ]);

      renderWithProviders(<DashboardPage />);
      await screen.findByText('Item aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

      await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'FUNDED');

      await waitFor(() => {
        expect(
          screen.queryByText('Item bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
        ).not.toBeInTheDocument();
      });
      expect(screen.getByText('Item aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBeInTheDocument();
      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(([input]) => input.toString().includes('state=FUNDED')),
        ).toBe(true);
      });
    });

    it('sends the selected sort option with the request', async () => {
      const fetchMock = stubEscrows([makeEscrow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')]);

      renderWithProviders(<DashboardPage />);
      await screen.findByText('Item aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

      await userEvent.selectOptions(screen.getByLabelText('Sort escrows'), 'price:desc');

      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(
            ([input]) =>
              input.toString().includes('sortBy=price') &&
              input.toString().includes('sortDir=desc'),
          ),
        ).toBe(true);
      });
    });

    it('paginates through results using the Next page control', async () => {
      const escrowsList = Array.from({ length: 21 }, (_, index) =>
        makeEscrow(`escrow-${index.toString().padStart(2, '0')}`),
      );
      const fetchMock = stubEscrows(escrowsList);

      renderWithProviders(<DashboardPage />);

      await screen.findByText('Showing 1–20 of 21');
      expect(screen.getByRole('button', { name: 'Next page' })).not.toBeDisabled();

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

      await screen.findByText('Showing 21–21 of 21');
      await waitFor(() => {
        expect(fetchMock.mock.calls.some(([input]) => input.toString().includes('page=2'))).toBe(
          true,
        );
      });
    });

    it('clears filters from the empty state when a search matches nothing', async () => {
      stubEscrows([makeEscrow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')]);

      renderWithProviders(<DashboardPage />);
      await screen.findByText('Item aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

      await userEvent.type(screen.getByLabelText('Search escrows'), 'nonexistent item');

      expect(
        await screen.findByText('No escrows match your filters', {}, { timeout: 2000 }),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

      expect(
        await screen.findByText('Item aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      ).toBeInTheDocument();
    });
  });
});
