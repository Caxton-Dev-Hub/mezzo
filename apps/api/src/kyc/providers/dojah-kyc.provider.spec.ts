import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DojahKycProvider } from './dojah-kyc.provider';
import { KycTier } from '../entities/kyc-tier.enum';

const BASE_URL = 'https://api.dojah.test';
const APP_ID = 'app-id';
const PRIVATE_KEY = 'private-key';

function buildProvider(): DojahKycProvider {
  const configService = {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'DOJAH_BASE_URL') return BASE_URL;
      if (key === 'DOJAH_APP_ID') return APP_ID;
      if (key === 'DOJAH_PRIVATE_KEY') return PRIVATE_KEY;
      throw new Error(`Unexpected config key ${key}`);
    }),
  } as unknown as ConfigService;

  return new DojahKycProvider(configService);
}

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function errorResponse(status = 502): Response {
  return {
    ok: false,
    status,
    statusText: 'Bad Gateway',
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('{"message":"upstream failure"}'),
  } as unknown as Response;
}

const fetchMock = jest.fn();
const request = { userId: 'user-1', tier: KycTier.TIER_1 };

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DojahKycProvider.submit', () => {
  it('sends the user id and tier with the configured credentials', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(okResponse({ reference_id: 'ref-1' }));

    await provider.submit(request);

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    expect(url).toBe(`${BASE_URL}/api/v1/kyc/verifications`);
    expect(JSON.parse(init.body)).toEqual({ user_id: 'user-1', tier: KycTier.TIER_1 });
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      AppId: APP_ID,
      Authorization: PRIVATE_KEY,
    });
  });

  it('returns the provider reference from a successful submission', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(okResponse({ reference_id: 'ref-1' }));

    await expect(provider.submit(request)).resolves.toEqual({ providerReference: 'ref-1' });
  });

  it('surfaces an upstream failure as a service unavailable error instead of a bare 500', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(errorResponse());

    await expect(provider.submit(request)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not leak the upstream body to the caller', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(errorResponse());

    const error = (await provider.submit(request).catch((caught: Error) => caught)) as Error;

    expect(error.message).toBe('KYC verification request failed');
    expect(error.message).not.toContain('upstream failure');
  });
});
