import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { KycTier, ProfileResponse } from '@mezzo/shared-types';
import ProfilePage from '../app/(app)/profile/page';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';

function makeProfile(overrides: Partial<ProfileResponse> = {}): ProfileResponse {
  return {
    id: USER_ID,
    email: 'seller@example.com',
    role: 'USER',
    businessName: 'Ada Electronics',
    bio: 'Refurbished laptops, shipped nationwide.',
    location: 'Lagos',
    avatarUrl: null,
    kycTier: 'TIER_1',
    completedEscrows: 7,
    memberSince: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

function stubFetch(
  options: { profile?: ProfileResponse; tier?: KycTier; onPatch?: (body: unknown) => void } = {},
) {
  const { profile = makeProfile(), tier = 'TIER_1', onPatch } = options;
  let current = profile;

  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? 'GET';

    if (url.includes('/kyc/me')) {
      return new Response(JSON.stringify({ tier, latestVerification: null, verificationEnabled: true }), { status: 200 });
    }

    if (url.includes('/profiles/me') && method === 'PATCH') {
      const body = JSON.parse(String(init?.body)) as Partial<ProfileResponse>;
      onPatch?.(body);
      current = { ...current, ...body };
      return new Response(JSON.stringify(current), { status: 200 });
    }

    if (url.includes('/profiles/me')) {
      return new Response(JSON.stringify(current), { status: 200 });
    }

    return new Response(JSON.stringify({}), { status: 200 });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
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

  it('shows the owner the same trust summary a counterparty would see', async () => {
    stubFetch();

    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText('Ada Electronics')).toBeInTheDocument();
    expect(screen.getByText('Identity verified')).toBeInTheDocument();
    expect(screen.getByText('Lagos')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('January 2026')).toBeInTheDocument();
  });

  it('links an unverified owner to the manual verification flow from the profile', async () => {
    stubFetch({
      tier: 'TIER_0',
      profile: makeProfile({ kycTier: 'TIER_0', completedEscrows: 0 }),
    });

    renderWithProviders(<ProfilePage />);

    expect(await screen.findByRole('link', { name: 'Verify now' })).toHaveAttribute(
      'href',
      '/kyc/verify?tier=TIER_1',
    );
  });

  it('hides the verification prompt once the owner is verified', async () => {
    stubFetch();

    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText('Ada Electronics')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Verify now' })).not.toBeInTheDocument();
  });

  it('saves edited profile details', async () => {
    const patched: unknown[] = [];
    stubFetch({ onPatch: (body) => patched.push(body) });

    renderWithProviders(<ProfilePage />);

    const nameInput = await screen.findByLabelText('Business name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Ada Devices');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => {
      expect(patched).toHaveLength(1);
    });
    expect(patched[0]).toMatchObject({ businessName: 'Ada Devices', location: 'Lagos' });
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
  });

  it('keeps the save button disabled until something actually changes', async () => {
    stubFetch();

    renderWithProviders(<ProfilePage />);

    expect(await screen.findByRole('button', { name: 'Save profile' })).toBeDisabled();
  });

  it('falls back to a placeholder name when the profile has none', async () => {
    stubFetch({ profile: makeProfile({ businessName: null, bio: null, location: null }) });

    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText('Unnamed trader')).toBeInTheDocument();
  });
});
