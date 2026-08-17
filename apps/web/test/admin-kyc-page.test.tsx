import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminKycPage from '../app/(app)/admin/kyc/page';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

function buildVerification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'verification-1',
    userId: 'user-1',
    status: 'PENDING',
    requestedTier: 'TIER_1',
    provider: 'manual',
    providerReference: 'manual-submission:abc',
    documents: [
      {
        id: 'doc-1',
        documentType: 'GOVERNMENT_ID',
        url: 'https://storage.test/doc-1',
        declaredMime: 'image/jpeg',
        detectedMime: 'image/jpeg',
        createdAt: new Date('2026-08-01T09:00:00Z').toISOString(),
      },
    ],
    createdAt: new Date('2026-08-01T09:00:00Z').toISOString(),
    ...overrides,
  };
}

function stubFetch(verifications: ReturnType<typeof buildVerification>[]) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = input.toString();

    if (url.includes('/admin/kyc/verifications/') && url.endsWith('/approve')) {
      return new Response(JSON.stringify({ ...verifications[0], status: 'APPROVED' }), {
        status: 200,
      });
    }
    if (url.includes('/admin/kyc/verifications/') && url.endsWith('/reject')) {
      return new Response(JSON.stringify({ ...verifications[0], status: 'REJECTED' }), {
        status: 200,
      });
    }
    if (url.includes('/admin/kyc/queue')) {
      return new Response(JSON.stringify(verifications), { status: 200 });
    }

    return new Response(JSON.stringify({}), { status: 200 });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('AdminKycPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'token',
      user: {
        id: ADMIN_ID,
        email: 'admin@mezzo.app',
        role: 'ADMIN',
        emailVerified: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
  });

  it('shows the submitted document thumbnails for a queued verification', async () => {
    stubFetch([buildVerification()]);
    renderWithProviders(<AdminKycPage />);

    expect(await screen.findByRole('link')).toHaveAttribute('href', 'https://storage.test/doc-1');
  });

  it('offers Approve and Reject only for a PENDING verification', async () => {
    stubFetch([
      buildVerification(),
      buildVerification({
        id: 'verification-2',
        userId: 'user-2',
        status: 'APPROVED',
        documents: [],
      }),
    ]);
    renderWithProviders(<AdminKycPage />);

    await screen.findByText('user-1');
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Reject' })).toHaveLength(1);
  });

  it('requires a reason before an approval can be confirmed', async () => {
    const user = userEvent.setup();
    stubFetch([buildVerification()]);
    renderWithProviders(<AdminKycPage />);

    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    const confirmButtons = screen.getAllByRole('button', { name: 'Approve' });
    const confirmButton = confirmButtons[confirmButtons.length - 1];
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText('Reason'), 'Documents check out');
    expect(confirmButton).not.toBeDisabled();

    await user.click(confirmButton);

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Approve this verification?' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('submits a reject decision with the given reason', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch([buildVerification()]);
    renderWithProviders(<AdminKycPage />);

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await user.type(screen.getByLabelText('Reason'), 'Photo is illegible');
    const confirmButtons = screen.getAllByRole('button', { name: 'Reject' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/admin/kyc/verifications/verification-1/reject'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });
});
