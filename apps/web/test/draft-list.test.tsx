import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EscrowDetailResponse } from '@mezzo/shared-types';
import { DraftList } from '../components/escrow/draft-list';
import { renderWithProviders } from './render-with-providers';
import { useEscrowWizardStore } from '../lib/escrow-wizard-store';
import { useAuthStore } from '../lib/auth-store';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeDraft(overrides: Partial<EscrowDetailResponse> = {}): EscrowDetailResponse {
  return {
    id: DRAFT_ID,
    state: 'DRAFT',
    version: 0,
    terms: {
      price: { amount: 1_500_000, currency: 'NGN' },
      inspectionWindowHours: 48,
      deliveryMethod: 'GIG',
      itemDescription: 'iPhone 14 Pro',
      feeBps: 250,
      requiresVerification: false,
      agreementText: null,
    },
    parties: [{ userId: USER_ID, role: 'BUYER', termsAcceptedAt: null }],
    trackingReference: null,
    deliveredAt: null,
    createdAt: new Date('2026-07-30T10:51:00Z'),
    updatedAt: new Date('2026-07-30T10:51:00Z'),
    ...overrides,
  };
}

describe('DraftList', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    push.mockReset();
    useEscrowWizardStore.getState().reset();
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

  it('resumes a draft in the wizard instead of starting a new escrow', async () => {
    const draft = makeDraft();
    renderWithProviders(<DraftList drafts={[draft]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));

    expect(useEscrowWizardStore.getState().escrow).toEqual(draft);
    expect(useEscrowWizardStore.getState().step).toBe(1);
    expect(push).toHaveBeenCalledWith('/escrow/new');
  });

  it('keeps the draft until the deletion is confirmed', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<DraftList drafts={[makeDraft()]} />);

    await userEvent.click(screen.getByRole('button', { name: /Delete draft iPhone 14 Pro/ }));
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Delete draft' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/escrows/${DRAFT_ID}/cancel`);
    expect(init.method).toBe('POST');
  });

  it('clears the wizard when the draft it was holding is deleted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    const draft = makeDraft();
    useEscrowWizardStore.getState().setEscrow(draft);

    renderWithProviders(<DraftList drafts={[draft]} />);

    await userEvent.click(screen.getByRole('button', { name: /Delete draft iPhone 14 Pro/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete draft' }));

    await waitFor(() => {
      expect(useEscrowWizardStore.getState().escrow).toBeNull();
    });
  });
});
