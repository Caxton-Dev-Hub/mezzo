import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { KycTier, PayoutAccountResponse, PayoutResponse } from '@mezzo/shared-types';
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

const SAVED_PAYOUT_ACCOUNT: PayoutAccountResponse = {
  bankCode: '058',
  bankName: 'GTBank',
  accountNumber: '0123456789',
  accountName: 'Jane Doe',
  updatedAt: new Date('2026-06-01T10:00:00Z'),
};

function stubFetch(
  options: {
    tier?: KycTier;
    payouts?: PayoutResponse[];
    onRequestPayout?: () => Response;
    verificationEnabled?: boolean;
    payoutAccount?: PayoutAccountResponse | null;
  } = {},
) {
  const {
    tier = 'TIER_1',
    payouts = [],
    onRequestPayout,
    verificationEnabled = true,
    payoutAccount = SAVED_PAYOUT_ACCOUNT,
  } = options;
  const requested: PayoutResponse[] = [];
  let currentPayoutAccount = payoutAccount;

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
    if (url.endsWith('/payouts/banks')) {
      return jsonResponse([
        { code: '011', name: 'First Bank of Nigeria' },
        { code: '058', name: 'GTBank' },
      ]);
    }
    if (url.endsWith('/payouts/verify-account')) {
      return jsonResponse({ accountName: 'Jane Doe' });
    }
    if (url.endsWith('/payouts/account')) {
      if (init?.method === 'PUT') {
        currentPayoutAccount = { ...SAVED_PAYOUT_ACCOUNT };
        return jsonResponse(currentPayoutAccount);
      }
      return jsonResponse(currentPayoutAccount);
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

  it('prompts a verified user with no saved payout account to add one before withdrawing', async () => {
    stubFetch({ payoutAccount: null });
    renderWithProviders(<WalletPage />);

    expect(await screen.findByRole('button', { name: 'Add payout account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
  });

  it('lets a user verify and save a payout account, unlocking withdrawals', async () => {
    const user = userEvent.setup();
    stubFetch({ payoutAccount: null });

    renderWithProviders(<WalletPage />);
    await user.click(await screen.findByRole('button', { name: 'Add payout account' }));

    await user.type(await screen.findByLabelText('Bank'), 'gtb');
    await user.click(await screen.findByRole('option', { name: 'GTBank' }));
    await user.type(screen.getByLabelText('Account number'), '0123456789');
    await user.click(screen.getByRole('button', { name: 'Verify account' }));

    expect(await screen.findByText(/Account name: Jane Doe/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save payout account' }));

    expect(await screen.findByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
  });

  it('narrows the bank list as the seller searches, and says so when nothing matches', async () => {
    const user = userEvent.setup();
    stubFetch({ payoutAccount: null });

    renderWithProviders(<WalletPage />);
    await user.click(await screen.findByRole('button', { name: 'Add payout account' }));

    const bankField = await screen.findByLabelText('Bank');
    await user.click(bankField);

    const listbox = await screen.findByRole('listbox', { name: 'Bank' });
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'First Bank of Nigeria',
      'GTBank',
    ]);

    await user.type(bankField, 'first');
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'First Bank of Nigeria',
    ]);

    await user.clear(bankField);
    await user.type(bankField, 'zzz');
    expect(within(listbox).queryAllByRole('option')).toHaveLength(0);
    expect(within(listbox).getByText('No bank matches that search')).toBeInTheDocument();
  });

  it('picks a searched bank with the keyboard alone', async () => {
    const user = userEvent.setup();
    stubFetch({ payoutAccount: null });

    renderWithProviders(<WalletPage />);
    await user.click(await screen.findByRole('button', { name: 'Add payout account' }));

    const bankField = await screen.findByLabelText('Bank');
    await user.type(bankField, 'gtb');
    await user.keyboard('{Enter}');

    expect(bankField).toHaveValue('GTBank');
    expect(screen.queryByRole('listbox', { name: 'Bank' })).not.toBeInTheDocument();
  });

  it('lets a verified user with a saved payout account request a payout, which lands as pending', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();

    renderWithProviders(<WalletPage />);
    await user.click(await screen.findByRole('button', { name: 'Withdraw' }));

    await user.type(screen.getByLabelText('Amount'), '500.00');
    await user.click(screen.getByRole('button', { name: 'Request payout' }));

    expect(await screen.findByText('Pending confirmation')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('shows the saved payout account details inside the withdraw modal', async () => {
    const user = userEvent.setup();
    stubFetch();

    renderWithProviders(<WalletPage />);
    await user.click(await screen.findByRole('button', { name: 'Withdraw' }));

    const dialog = screen.getByRole('dialog', { name: 'Withdraw to your bank' });
    expect(within(dialog).getByText(/GTBank/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Jane Doe/)).toBeInTheDocument();
  });

  it('refuses a payout larger than the available balance before calling the API', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();

    renderWithProviders(<WalletPage />);
    await user.click(await screen.findByRole('button', { name: 'Withdraw' }));

    await user.type(screen.getByLabelText('Amount'), '9999999.00');
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
