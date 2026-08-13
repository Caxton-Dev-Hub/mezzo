import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminSettingsPage from '../app/(app)/admin/settings/page';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/admin/settings',
}));

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

function stubFetch(verificationEnabled: boolean) {
  let current = {
    verificationEnabled,
    updatedAt: new Date('2026-08-01T09:00:00Z').toISOString(),
    updatedById: ADMIN_ID,
  };

  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = input.toString();

    if (url.includes('/admin/settings/verification')) {
      const body = JSON.parse(String(init?.body)) as { enabled: boolean; reason: string };
      current = { ...current, verificationEnabled: body.enabled };
      return new Response(JSON.stringify(current), { status: 200 });
    }

    return new Response(JSON.stringify(current), { status: 200 });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('AdminSettingsPage', () => {
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

  it('shows verification as live and offers to take it offline', async () => {
    stubFetch(true);
    renderWithProviders(<AdminSettingsPage />);

    expect(await screen.findByText('Live')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set to coming soon' })).toBeInTheDocument();
  });

  it('refuses to change the setting without a reason for the audit trail', async () => {
    const fetchMock = stubFetch(true);
    renderWithProviders(<AdminSettingsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Set to coming soon' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Say why you are making this change');
    expect(
      fetchMock.mock.calls.some(([input]) => input.toString().includes('/settings/verification')),
    ).toBe(false);
  });

  it('sends the reason and flips the flag to coming soon', async () => {
    const fetchMock = stubFetch(true);
    renderWithProviders(<AdminSettingsPage />);

    await userEvent.type(
      await screen.findByLabelText('Reason'),
      'Provider integration is not live yet',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Set to coming soon' }));

    await waitFor(() => expect(screen.getByText('Coming soon')).toBeInTheDocument());

    const call = fetchMock.mock.calls.find(([input]) =>
      input.toString().includes('/settings/verification'),
    );
    expect(call).toBeDefined();
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      enabled: false,
      reason: 'Provider integration is not live yet',
    });
  });

  it('warns that tier gates are not enforced while verification is off', async () => {
    stubFetch(false);
    renderWithProviders(<AdminSettingsPage />);

    expect(await screen.findByText(/nothing is gated behind a KYC tier/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn verification on' })).toBeInTheDocument();
  });
});
