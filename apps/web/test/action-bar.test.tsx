import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EscrowDetailResponse, EscrowRole, EscrowState } from '@mezzo/shared-types';
import { ActionBar } from '../components/escrow/action-bar';
import { renderWithProviders } from './render-with-providers';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const BUYER_ID = 'buyer-id';
const SELLER_ID = 'seller-id';

function makeEscrow(
  state: EscrowState,
  options: {
    twoParties?: boolean;
    buyerAccepted?: boolean;
    sellerAccepted?: boolean;
  } = {},
): EscrowDetailResponse {
  const { twoParties = true, buyerAccepted = false, sellerAccepted = false } = options;

  const parties: EscrowDetailResponse['parties'] = [
    { userId: BUYER_ID, role: 'BUYER' as EscrowRole, termsAcceptedAt: buyerAccepted ? new Date() : null },
  ];
  if (twoParties) {
    parties.push({
      userId: SELLER_ID,
      role: 'SELLER' as EscrowRole,
      termsAcceptedAt: sellerAccepted ? new Date() : null,
    });
  }

  return {
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
    parties,
    trackingReference: null,
    deliveredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('ActionBar', () => {
  it.each([
    ['FUNDED' as EscrowState, 'SELLER' as EscrowRole, 'Mark as shipped', true],
    ['FUNDED' as EscrowState, 'BUYER' as EscrowRole, 'Mark as shipped', false],
    ['SHIPPED' as EscrowState, 'BUYER' as EscrowRole, 'Confirm delivery', true],
    ['SHIPPED' as EscrowState, 'SELLER' as EscrowRole, 'Confirm delivery', false],
    ['DELIVERED' as EscrowState, 'BUYER' as EscrowRole, 'Release funds', true],
    ['DELIVERED' as EscrowState, 'SELLER' as EscrowRole, 'Release funds', false],
  ])('in %s as %s, shows "%s": %s', (state, role, actionLabel, shouldShow) => {
    const escrow = makeEscrow(state);
    const currentUserId = role === 'BUYER' ? BUYER_ID : SELLER_ID;

    renderWithProviders(<ActionBar escrow={escrow} currentUserId={currentUserId} />);

    if (shouldShow) {
      expect(screen.getByRole('button', { name: actionLabel })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole('button', { name: actionLabel })).not.toBeInTheDocument();
    }
  });

  it.each([
    ['AGREED' as EscrowState, 'BUYER' as EscrowRole, true],
    ['AGREED' as EscrowState, 'SELLER' as EscrowRole, false],
    ['PENDING_COUNTERPARTY' as EscrowState, 'BUYER' as EscrowRole, false],
    ['FUNDED' as EscrowState, 'BUYER' as EscrowRole, false],
  ])('in %s as %s, offers the funding entry point: %s', (state, role, shouldShow) => {
    const currentUserId = role === 'BUYER' ? BUYER_ID : SELLER_ID;
    renderWithProviders(<ActionBar escrow={makeEscrow(state)} currentUserId={currentUserId} />);

    const link = screen.queryByRole('link', { name: 'Fund escrow' });
    if (shouldShow) {
      expect(link).toHaveAttribute('href', '/escrow/escrow-1/fund');
    } else {
      expect(link).not.toBeInTheDocument();
    }
  });

  it('tells the seller the buyer still has to fund an AGREED escrow', () => {
    renderWithProviders(<ActionBar escrow={makeEscrow('AGREED')} currentUserId={SELLER_ID} />);
    expect(screen.getByText(/waiting for the buyer to fund/i)).toBeInTheDocument();
  });

  it.each([
    ['FUNDED' as EscrowState, 'BUYER' as EscrowRole, true],
    ['FUNDED' as EscrowState, 'SELLER' as EscrowRole, false],
    ['SHIPPED' as EscrowState, 'BUYER' as EscrowRole, true],
    ['SHIPPED' as EscrowState, 'SELLER' as EscrowRole, false],
    ['DELIVERED' as EscrowState, 'BUYER' as EscrowRole, true],
    ['DELIVERED' as EscrowState, 'SELLER' as EscrowRole, false],
  ])(
    'in %s as %s, offers "Raise a dispute" so a buyer can dispute before delivery too: %s',
    (state, role, shouldShow) => {
      const escrow = makeEscrow(state);
      const currentUserId = role === 'BUYER' ? BUYER_ID : SELLER_ID;
      renderWithProviders(<ActionBar escrow={escrow} currentUserId={currentUserId} />);

      if (shouldShow) {
        expect(screen.getByRole('button', { name: 'Raise a dispute' })).toBeInTheDocument();
      } else {
        expect(screen.queryByRole('button', { name: 'Raise a dispute' })).not.toBeInTheDocument();
      }
    },
  );

  it('offers Accept terms to a party who has not yet accepted in PENDING_COUNTERPARTY', () => {
    const escrow = makeEscrow('PENDING_COUNTERPARTY', { buyerAccepted: false });
    renderWithProviders(<ActionBar escrow={escrow} currentUserId={BUYER_ID} />);
    expect(screen.getByRole('button', { name: 'Accept terms' })).toBeInTheDocument();
  });

  it('requires checking the agreement before the accept-terms confirmation can be submitted', async () => {
    const escrow = makeEscrow('PENDING_COUNTERPARTY', { buyerAccepted: false });
    escrow.terms = { ...escrow.terms!, agreementText: 'Buyer pays for return shipping.' };
    renderWithProviders(<ActionBar escrow={escrow} currentUserId={BUYER_ID} />);

    await userEvent.click(screen.getByRole('button', { name: 'Accept terms' }));

    expect(screen.getByText('Buyer pays for return shipping.')).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', { name: 'Accept terms' });
    const confirmButton = confirmButtons[confirmButtons.length - 1];
    expect(confirmButton).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    expect(confirmButton).not.toBeDisabled();
  });

  it('shows a waiting message instead of Accept terms once the viewer already accepted', () => {
    const escrow = makeEscrow('PENDING_COUNTERPARTY', { buyerAccepted: true });
    renderWithProviders(<ActionBar escrow={escrow} currentUserId={BUYER_ID} />);
    expect(screen.queryByRole('button', { name: 'Accept terms' })).not.toBeInTheDocument();
    expect(screen.getByText(/waiting for the other party/i)).toBeInTheDocument();
  });

  it.each([
    ['PENDING_COUNTERPARTY' as EscrowState, true],
    ['AGREED' as EscrowState, true],
    ['DELIVERED' as EscrowState, false],
  ])('cancel is available in %s: %s', (state, shouldShow) => {
    renderWithProviders(<ActionBar escrow={makeEscrow(state)} currentUserId={BUYER_ID} />);
    if (shouldShow) {
      expect(screen.getByRole('button', { name: 'Cancel escrow' })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole('button', { name: 'Cancel escrow' })).not.toBeInTheDocument();
    }
  });

  it('offers the seller a way to withdraw once funds are released', () => {
    const escrow = makeEscrow('RELEASED');
    renderWithProviders(<ActionBar escrow={escrow} currentUserId={SELLER_ID} />);

    expect(screen.getByText(/funds were released to your wallet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Withdraw funds' })).toHaveAttribute('href', '/wallet');
  });

  it.each([
    ['RELEASED' as EscrowState, /funds were released to the seller/i],
    ['REFUNDED' as EscrowState, /funds were refunded to the buyer/i],
    ['CANCELLED' as EscrowState, /this escrow was cancelled/i],
    ['DISPUTED' as EscrowState, /frozen while an arbiter reviews/i],
  ])('offers no actions in %s, and explains why instead', (state, expectedMessage) => {
    renderWithProviders(<ActionBar escrow={makeEscrow(state)} currentUserId={BUYER_ID} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText(expectedMessage)).toBeInTheDocument();
  });
});
