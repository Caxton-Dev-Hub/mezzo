import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KycVerifyPage from '../app/(app)/kyc/verify/page';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';
import type { KycDocumentSlot } from '../hooks/use-kyc-document-queue';

const push = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParamsValue,
}));

let queueState: {
  slots: Record<string, KycDocumentSlot>;
  confirmedDocumentIds: string[];
  allConfirmed: boolean;
};

vi.mock('../hooks/use-kyc-document-queue', () => ({
  useKycDocumentQueue: () => ({
    slots: queueState.slots,
    uploadDocument: vi.fn(),
    confirmedDocumentIds: queueState.confirmedDocumentIds,
    allConfirmed: queueState.allConfirmed,
  }),
}));

function emptySlot(): KycDocumentSlot {
  return { status: 'idle', previewUrl: null, progress: 0 };
}

function stubFetch() {
  const fetchMock = vi.fn(
    async (_input: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: 'verification-1', status: 'PENDING' }), { status: 201 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('KycVerifyPage', () => {
  beforeEach(() => {
    push.mockReset();
    searchParamsValue = new URLSearchParams('tier=TIER_2');
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'token',
      user: {
        id: 'buyer-id',
        email: 'buyer@example.com',
        role: 'USER',
        emailVerified: true,
        createdAt: new Date(),
      },
    });
  });

  it('disables submission until both documents are confirmed', () => {
    stubFetch();
    queueState = {
      slots: { GOVERNMENT_ID: emptySlot(), SELFIE: emptySlot() },
      confirmedDocumentIds: [],
      allConfirmed: false,
    };
    renderWithProviders(<KycVerifyPage />);

    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
  });

  it('mentions the tier requested via the query string', () => {
    stubFetch();
    queueState = {
      slots: { GOVERNMENT_ID: emptySlot(), SELFIE: emptySlot() },
      confirmedDocumentIds: [],
      allConfirmed: false,
    };
    renderWithProviders(<KycVerifyPage />);

    expect(screen.getByText(/Address verified/i)).toBeInTheDocument();
  });

  it('submits the confirmed document ids and redirects once both are uploaded', async () => {
    const user = userEvent.setup();
    queueState = {
      slots: { GOVERNMENT_ID: emptySlot(), SELFIE: emptySlot() },
      confirmedDocumentIds: ['doc-1', 'doc-2'],
      allConfirmed: true,
    };
    const fetchMock = stubFetch();
    renderWithProviders(<KycVerifyPage />);

    const submit = screen.getByRole('button', { name: 'Submit for review' });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/wallet'));
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      tier: 'TIER_2',
      documentIds: ['doc-1', 'doc-2'],
    });
  });
});
