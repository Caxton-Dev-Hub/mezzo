import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { PublicProfileResponse } from '@mezzo/shared-types';
import PublicProfilePage from '../app/(app)/users/[id]/page';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

const OWNER_ID = '22222222-2222-4222-8222-222222222222';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: '22222222-2222-4222-8222-222222222222' }),
}));

const VIEWER_ID = '11111111-1111-4111-8111-111111111111';

function makePublicProfile(overrides: Partial<PublicProfileResponse> = {}): PublicProfileResponse {
  return {
    id: OWNER_ID,
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

function stubFetch(profile: PublicProfileResponse | { status: number }) {
  const fetchMock = vi.fn(async () => {
    if (!('id' in profile)) {
      return new Response(
        JSON.stringify({ statusCode: profile.status, code: 'NOT_FOUND', message: 'Not found' }),
        { status: profile.status },
      );
    }
    return new Response(JSON.stringify(profile), { status: 200 });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  return renderWithProviders(<PublicProfilePage />);
}

describe('PublicProfilePage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'token',
      user: { id: VIEWER_ID, email: 'viewer@example.com', role: 'USER', createdAt: new Date() },
    });
  });

  it('shows the trust signals a viewer needs to decide whether to transact', async () => {
    stubFetch(makePublicProfile());

    renderPage();

    expect(await screen.findByText('Ada Electronics')).toBeInTheDocument();
    expect(screen.getByText('Identity verified')).toBeInTheDocument();
    expect(screen.getByText('Lagos')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('January 2026')).toBeInTheDocument();
    expect(screen.getByText('Refurbished laptops, shipped nationwide.')).toBeInTheDocument();
  });

  it('never renders contact details, because the API does not return them', async () => {
    stubFetch(makePublicProfile());

    renderPage();

    await screen.findByText('Ada Electronics');
    expect(screen.queryByText(/@example\.com/)).not.toBeInTheDocument();
  });

  it('marks an unverified trader plainly rather than staying silent', async () => {
    stubFetch(makePublicProfile({ kycTier: 'TIER_0', completedEscrows: 0 }));

    renderPage();

    expect(await screen.findByText('Not yet verified')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('surfaces a readable message when the profile cannot be loaded', async () => {
    stubFetch({ status: 404 });

    renderPage();

    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });
});
