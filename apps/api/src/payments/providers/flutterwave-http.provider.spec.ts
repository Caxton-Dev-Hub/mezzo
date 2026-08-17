import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlutterwaveHttpProvider } from './flutterwave-http.provider';
import { callArg, callArgs } from '../../../test/support/mock-calls';

const BASE_URL = 'https://api.flutterwave.test/v3';
const SECRET_KEY = 'FLWSECK_TEST-abc123';

function buildProvider(): FlutterwaveHttpProvider {
  const configService = {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'FLUTTERWAVE_SECRET_KEY') {
        return SECRET_KEY;
      }
      if (key === 'FLUTTERWAVE_BASE_URL') {
        return BASE_URL;
      }
      throw new Error(`Unexpected config key ${key}`);
    }),
  } as unknown as ConfigService;

  return new FlutterwaveHttpProvider(configService);
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

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('FlutterwaveHttpProvider.initiateTransfer', () => {
  const input = {
    amountKobo: 50_000,
    currency: 'NGN' as const,
    reference: 'payout-ref',
    accountNumber: '0123456789',
    bankCode: '058',
    reason: 'Mezzo seller payout',
  };

  it('sends the transfer with the amount converted to major units', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(
      okResponse({ status: 'success', message: 'ok', data: { id: 1, reference: 'payout-ref' } }),
    );

    await provider.initiateTransfer(input);

    const [url, init] = callArgs(fetchMock)[0] as [string, { body: string }];
    expect(url).toBe(`${BASE_URL}/transfers`);
    expect(JSON.parse(init.body)).toEqual({
      account_bank: '058',
      account_number: '0123456789',
      amount: '500.00',
      currency: 'NGN',
      reference: 'payout-ref',
      narration: 'Mezzo seller payout',
    });
  });

  it('returns the transfer id and reference on success', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(
      okResponse({ status: 'success', message: 'ok', data: { id: 42, reference: 'payout-ref' } }),
    );

    await expect(provider.initiateTransfer(input)).resolves.toEqual({
      transferCode: '42',
      reference: 'payout-ref',
    });
  });

  it('surfaces an upstream http failure as a service unavailable error', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(errorResponse());

    await expect(provider.initiateTransfer(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('treats a 200 response carrying an error status as a failed transfer', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(
      okResponse({ status: 'error', message: 'Insufficient balance', data: null }),
    );

    await expect(provider.initiateTransfer(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('does not leak the upstream error detail to the caller', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(
      okResponse({ status: 'error', message: 'Insufficient balance', data: null }),
    );

    const error = (await provider
      .initiateTransfer(input)
      .catch((caught: Error) => caught)) as Error;

    expect(error.message).toBe('Flutterwave transfer initiation failed');
    expect(error.message).not.toContain('Insufficient balance');
  });
});

describe('FlutterwaveHttpProvider.listBanks', () => {
  it('returns the Nigerian bank list', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(
      okResponse({
        status: 'success',
        data: [
          { id: 1, code: '058', name: 'GTBank' },
          { id: 2, code: '011', name: 'First Bank of Nigeria' },
        ],
      }),
    );

    await expect(provider.listBanks()).resolves.toEqual([
      { code: '058', name: 'GTBank' },
      { code: '011', name: 'First Bank of Nigeria' },
    ]);

    const url = callArg<string>(fetchMock, 0, 0);
    expect(url).toBe(`${BASE_URL}/banks/NG`);
  });

  it('surfaces an upstream failure as a service unavailable error', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(errorResponse());

    await expect(provider.listBanks()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('FlutterwaveHttpProvider.resolveAccount', () => {
  const input = { accountNumber: '0123456789', bankCode: '058' };

  it('resolves the account holder name for a bank code and account number', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(
      okResponse({
        status: 'success',
        message: 'ok',
        data: { account_number: '0123456789', account_name: 'Jane Doe' },
      }),
    );

    await expect(provider.resolveAccount(input)).resolves.toEqual({ accountName: 'Jane Doe' });

    const [url, init] = callArgs(fetchMock)[0] as [string, { body: string }];
    expect(url).toBe(`${BASE_URL}/accounts/resolve`);
    expect(JSON.parse(init.body)).toEqual({
      account_number: '0123456789',
      account_bank: '058',
    });
  });

  it('treats a 200 response carrying an error status as an unresolved account', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(
      okResponse({ status: 'error', message: 'No account found', data: null }),
    );

    await expect(provider.resolveAccount(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('surfaces an upstream http failure as a service unavailable error', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(errorResponse());

    await expect(provider.resolveAccount(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
