import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ensureFreshSession } from '../lib/auth-client';
import { useAuthStore } from '../lib/auth-store';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe('ensureFreshSession', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'pending', accessToken: null, user: null });
  });

  it('updates the store and returns the access token on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, {
          accessToken: 'fresh-token',
          user: { id: '1', email: 'buyer@example.com', role: 'USER', createdAt: new Date().toISOString() },
        }),
      ),
    );

    const token = await ensureFreshSession();

    expect(token).toBe('fresh-token');
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().accessToken).toBe('fresh-token');
  });

  it('clears the session and returns null when refresh fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { statusCode: 401, code: 'NO_SESSION', message: 'no session' })),
    );

    const token = await ensureFreshSession();

    expect(token).toBeNull();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('dedupes concurrent callers into a single network request', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        accessToken: 'fresh-token',
        user: { id: '1', email: 'buyer@example.com', role: 'USER', createdAt: new Date().toISOString() },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([ensureFreshSession(), ensureFreshSession()]);

    expect(first).toBe('fresh-token');
    expect(second).toBe('fresh-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
