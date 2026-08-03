import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { GoogleSignInButton } from '../components/auth/google-sign-in-button';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

interface InitializeConfig {
  client_id: string;
  callback: (response: { credential?: string }) => void;
}

let capturedConfig: InitializeConfig | null = null;

function stubGoogleIdentity(): { renderButton: ReturnType<typeof vi.fn> } {
  const renderButton = vi.fn();

  vi.stubGlobal('google', {
    accounts: {
      id: {
        initialize: (config: InitializeConfig) => {
          capturedConfig = config;
        },
        renderButton,
        cancel: vi.fn(),
      },
    },
  });

  return { renderButton };
}

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    push.mockClear();
    capturedConfig = null;
    useAuthStore.setState({ status: 'pending', accessToken: null, user: null });
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-client.apps.googleusercontent.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('renders nothing when no Google client id is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');
    stubGoogleIdentity();

    const { container } = renderWithProviders(<GoogleSignInButton />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the Google button against the configured client id', async () => {
    const { renderButton } = stubGoogleIdentity();

    renderWithProviders(<GoogleSignInButton />);

    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(capturedConfig?.client_id).toBe('test-client.apps.googleusercontent.com');
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('exchanges the Google credential for a session and redirects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              accessToken: 'access-token',
              user: {
                id: '1',
                email: 'buyer@example.com',
                role: 'USER',
                createdAt: new Date().toISOString(),
              },
            }),
            { status: 200 },
          ),
      ),
    );
    stubGoogleIdentity();

    renderWithProviders(<GoogleSignInButton redirectTo="/escrow/1" />);

    await waitFor(() => expect(capturedConfig).not.toBeNull());
    capturedConfig?.callback({ credential: 'google-id-token' });

    await waitFor(() => expect(push).toHaveBeenCalledWith('/escrow/1'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/google',
      expect.objectContaining({ body: JSON.stringify({ idToken: 'google-id-token' }) }),
    );
    expect(useAuthStore.getState().accessToken).toBe('access-token');
  });

  it('surfaces a rejected Google sign-in without starting a session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              statusCode: 403,
              code: 'GOOGLE_EMAIL_NOT_VERIFIED',
              message: 'Verify your email address with Google before signing in',
            }),
            { status: 403 },
          ),
      ),
    );
    stubGoogleIdentity();

    renderWithProviders(<GoogleSignInButton />);

    await waitFor(() => expect(capturedConfig).not.toBeNull());
    capturedConfig?.callback({ credential: 'google-id-token' });

    expect(
      await screen.findByText('Verify your email address with Google before signing in'),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('pending');
  });
});
