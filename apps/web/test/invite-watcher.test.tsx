import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import type { EscrowDetailResponse } from '@mezzo/shared-types';
import { InviteWatcher } from '../components/escrow/wizard/invite-watcher';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';
import { useEscrowWizardStore } from '../lib/escrow-wizard-store';
import { getEscrow } from '../lib/escrow-client';

const CREATOR_ID = '11111111-1111-4111-8111-111111111111';
const COUNTERPARTY_ID = '22222222-2222-4222-8222-222222222222';
const ESCROW_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type Listener = (...args: unknown[]) => void;

let listeners: Record<string, Listener[]>;

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('socket.io-client', () => ({
  io: () => {
    listeners = {};
    return {
      on: (event: string, handler: Listener) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event].push(handler);
      },
      emit: vi.fn(),
      io: { on: vi.fn() },
      close: vi.fn(),
    };
  },
}));

vi.mock('../lib/escrow-client', () => ({
  getEscrow: vi.fn(),
}));

function makeEscrow(partyCount: 1 | 2): EscrowDetailResponse {
  const parties: EscrowDetailResponse['parties'] = [
    { userId: CREATOR_ID, role: 'BUYER', termsAcceptedAt: null },
  ];
  if (partyCount === 2) {
    parties.push({ userId: COUNTERPARTY_ID, role: 'SELLER', termsAcceptedAt: null });
  }
  return {
    id: ESCROW_ID,
    state: 'PENDING_COUNTERPARTY',
    version: 1,
    terms: {
      price: { amount: 1_500_000, currency: 'NGN' },
      inspectionWindowHours: 48,
      deliveryMethod: 'GIG',
      itemDescription: 'iPhone 14 Pro',
      feeBps: 250,
      requiresVerification: false,
      agreementText: null,
    },
    parties,
    trackingReference: null,
    deliveredAt: null,
    createdAt: new Date('2026-07-30T10:51:00Z'),
    updatedAt: new Date('2026-07-30T10:51:00Z'),
  };
}

describe('InviteWatcher', () => {
  beforeEach(() => {
    replace.mockReset();
    vi.mocked(getEscrow).mockReset();
    listeners = {};
    useEscrowWizardStore.getState().reset();
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'token',
      user: {
        id: CREATOR_ID,
        email: 'creator@example.com',
        role: 'USER',
        emailVerified: true,
        createdAt: new Date(),
      },
    });
  });

  it('waits on the invite screen while the counterparty has not joined', async () => {
    vi.mocked(getEscrow).mockResolvedValue(makeEscrow(1));

    renderWithProviders(<InviteWatcher escrowId={ESCROW_ID} />);

    await screen.findByText(/Waiting for the other party to accept/);
    expect(replace).not.toHaveBeenCalled();
  });

  it('opens the escrow page as soon as the counterparty accepts', async () => {
    vi.mocked(getEscrow).mockResolvedValueOnce(makeEscrow(1)).mockResolvedValue(makeEscrow(2));

    renderWithProviders(<InviteWatcher escrowId={ESCROW_ID} />);
    await screen.findByText(/Waiting for the other party to accept/);

    await act(async () => {
      for (const handler of listeners['escrow:updated'] ?? []) {
        handler({
          escrowId: ESCROW_ID,
          eventType: 'COUNTERPARTY_JOINED',
          occurredAt: new Date(),
        });
      }
    });

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(`/escrow/${ESCROW_ID}`);
    });
  });

  it('clears the wizard once it has handed off to the escrow page', async () => {
    vi.mocked(getEscrow).mockResolvedValue(makeEscrow(2));
    useEscrowWizardStore.getState().setEscrow(makeEscrow(2));

    const { unmount } = renderWithProviders(<InviteWatcher escrowId={ESCROW_ID} />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(`/escrow/${ESCROW_ID}`);
    });

    unmount();

    expect(useEscrowWizardStore.getState().escrow).toBeNull();
  });
});
