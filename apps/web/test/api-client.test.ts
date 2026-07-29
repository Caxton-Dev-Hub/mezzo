import { describe, expect, it, vi, beforeEach } from 'vitest';

const refreshRequest = vi.fn();

vi.mock('../lib/auth-client', () => ({
  refreshRequest: (...args: unknown[]) => refreshRequest(...args),
}));

import { apiRequest } from '../lib/api-client';
import { useAuthStore } from '../lib/auth-store';
import { ApiError } from '../lib/api-error';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe('apiRequest', () => {
  beforeEach(() => {
    refreshRequest.mockReset();
    useAuthStore.setState({ status: 'authenticated', accessToken: 'stale-token', user: null });
  });

  it('retries once after a successful silent refresh on 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    refreshRequest.mockResolvedValue({
      accessToken: 'fresh-token',
      user: { id: '1', email: 'buyer@example.com', role: 'USER', createdAt: new Date().toISOString() },
    });

    const result = await apiRequest<{ ok: boolean }>('/escrows');

    expect(result).toEqual({ ok: true });
    expect(refreshRequest).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryHeaders = fetchMock.mock.calls[1][1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-token');
    expect(useAuthStore.getState().accessToken).toBe('fresh-token');
  });

  it('dedupes concurrent 401s into a single refresh call', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'expired' }));
    vi.stubGlobal('fetch', fetchMock);

    let resolveRefresh: (value: unknown) => void = () => {};
    refreshRequest.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Headers;
      if (headers.get('Authorization') === 'Bearer fresh-token') {
        return jsonResponse(200, { ok: true });
      }
      return jsonResponse(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'expired' });
    });

    const [firstResult, secondResult] = await Promise.all([
      apiRequest<{ ok: boolean }>('/escrows/1'),
      apiRequest<{ ok: boolean }>('/escrows/2'),
      (async () => {
        await Promise.resolve();
        resolveRefresh({
          accessToken: 'fresh-token',
          user: { id: '1', email: 'buyer@example.com', role: 'USER', createdAt: new Date().toISOString() },
        });
      })(),
    ]).then(([a, b]) => [a, b]);

    expect(firstResult).toEqual({ ok: true });
    expect(secondResult).toEqual({ ok: true });
    expect(refreshRequest).toHaveBeenCalledTimes(1);
  });

  it('clears the session and throws when the silent refresh itself fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'expired' }));
    vi.stubGlobal('fetch', fetchMock);
    refreshRequest.mockRejectedValue(new ApiError({ statusCode: 401, code: 'NO_SESSION', message: 'no session' }));

    await expect(apiRequest('/escrows')).rejects.toThrow(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
