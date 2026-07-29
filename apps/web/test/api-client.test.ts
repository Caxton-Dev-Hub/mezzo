import { describe, expect, it, vi, beforeEach } from 'vitest';

const ensureFreshSession = vi.fn();

vi.mock('../lib/auth-client', () => ({
  ensureFreshSession: (...args: unknown[]) => ensureFreshSession(...args),
}));

import { apiRequest } from '../lib/api-client';
import { useAuthStore } from '../lib/auth-store';
import { ApiError } from '../lib/api-error';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe('apiRequest', () => {
  beforeEach(() => {
    ensureFreshSession.mockReset();
    useAuthStore.setState({ status: 'authenticated', accessToken: 'stale-token', user: null });
  });

  it('retries once after a successful silent refresh on 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    ensureFreshSession.mockResolvedValue('fresh-token');

    const result = await apiRequest<{ ok: boolean }>('/escrows');

    expect(result).toEqual({ ok: true });
    expect(ensureFreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryHeaders = fetchMock.mock.calls[1][1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-token');
  });

  it('does not retry, and surfaces the original error, when the silent refresh fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'expired' }));
    vi.stubGlobal('fetch', fetchMock);
    ensureFreshSession.mockResolvedValue(null);

    await expect(apiRequest('/escrows')).rejects.toThrow(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ensureFreshSession).toHaveBeenCalledTimes(1);
  });

  it('never attempts a refresh for requests marked skipAuth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'expired' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/invites/token', { skipAuth: true })).rejects.toThrow(ApiError);
    expect(ensureFreshSession).not.toHaveBeenCalled();
  });
});
