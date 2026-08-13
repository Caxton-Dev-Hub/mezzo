import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaystackHttpProvider } from './paystack-http.provider';
import { callArg, callArgs } from '../../../test/support/mock-calls';

const BASE_URL = 'https://api.paystack.test';
const SECRET_KEY = 'sk_test_123';

function buildProvider(): PaystackHttpProvider {
  const configService = {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'PAYSTACK_SECRET_KEY') {
        return SECRET_KEY;
      }
      if (key === 'PAYSTACK_BASE_URL') {
        return BASE_URL;
      }
      throw new Error(`Unexpected config key ${key}`);
    }),
  } as unknown as ConfigService;

  return new PaystackHttpProvider(configService);
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

describe('PaystackHttpProvider.initializeTransaction', () => {
  const input = {
    email: 'buyer@example.com',
    amountKobo: 100_000,
    currency: 'NGN' as const,
    reference: 'ref-1',
    metadata: { escrowId: 'escrow-1' },
  };

  it('sends the amount in minor units with the caller reference', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(
      okResponse({ status: true, data: { authorization_url: 'https://pay/checkout', reference: 'ref-1' } }),
    );

    await provider.initializeTransaction(input);

    const [url, init] = callArgs(fetchMock)[0] as [string, { body: string }];
    expect(url).toBe(`${BASE_URL}/transaction/initialize`);
    expect(JSON.parse(init.body)).toEqual({
      email: 'buyer@example.com',
      amount: 100_000,
      currency: 'NGN',
      reference: 'ref-1',
      metadata: { escrowId: 'escrow-1' },
    });
  });

  it('authenticates with the configured secret key', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(
      okResponse({ status: true, data: { authorization_url: 'https://pay/checkout', reference: 'ref-1' } }),
    );

    await provider.initializeTransaction(input);

    expect(callArg<{ headers: Record<string, string> }>(fetchMock, 0, 1).headers).toEqual({
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
    });
  });

  it('returns the checkout url the buyer must visit', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(
      okResponse({ status: true, data: { authorization_url: 'https://pay/checkout', reference: 'ref-1' } }),
    );

    await expect(provider.initializeTransaction(input)).resolves.toEqual({
      authorizationUrl: 'https://pay/checkout',
      reference: 'ref-1',
    });
  });

  it('surfaces an upstream failure as a service unavailable error', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(errorResponse());

    await expect(provider.initializeTransaction(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('does not leak the upstream body to the caller', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(errorResponse());

    const error = (await provider
      .initializeTransaction(input)
      .catch((caught: Error) => caught)) as Error;

    expect(error.message).toBe('Paystack transaction initialization failed');
    expect(error.message).not.toContain('upstream failure');
  });
});

describe('PaystackHttpProvider.listTransactions', () => {
  const window = {
    from: new Date('2026-01-01T00:00:00.000Z'),
    to: new Date('2026-02-01T00:00:00.000Z'),
  };

  it('queries the window as iso timestamps', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(okResponse({ status: true, data: [] }));

    await provider.listTransactions(window);

    const url = callArg<string>(fetchMock, 0, 0);
    expect(url).toContain('from=2026-01-01T00%3A00%3A00.000Z');
    expect(url).toContain('to=2026-02-01T00%3A00%3A00.000Z');
  });

  it('maps a successful charge into the provider transaction shape', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(
      okResponse({
        status: true,
        data: [
          {
            reference: 'ref-1',
            amount: 100_000,
            currency: 'NGN',
            status: 'success',
            paid_at: '2026-01-15T00:00:00.000Z',
          },
        ],
      }),
    );

    await expect(provider.listTransactions(window)).resolves.toEqual([
      {
        reference: 'ref-1',
        amountKobo: 100_000,
        currency: 'NGN',
        status: 'success',
        paidAt: new Date('2026-01-15T00:00:00.000Z'),
      },
    ]);
  });

  it('preserves an abandoned checkout as its own status', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(
      okResponse({
        status: true,
        data: [
          { reference: 'ref-1', amount: 1, currency: 'NGN', status: 'abandoned', paid_at: null },
        ],
      }),
    );

    const [transaction] = await provider.listTransactions(window);

    expect(transaction.status).toBe('abandoned');
    expect(transaction.paidAt).toBeNull();
  });

  it('treats any unrecognised upstream status as failed', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(
      okResponse({
        status: true,
        data: [
          { reference: 'ref-1', amount: 1, currency: 'NGN', status: 'reversed', paid_at: null },
        ],
      }),
    );

    const [transaction] = await provider.listTransactions(window);

    expect(transaction.status).toBe('failed');
  });

  it('surfaces an upstream failure as a service unavailable error', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValue(errorResponse());

    await expect(provider.listTransactions(window)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('PaystackHttpProvider.initiateTransfer', () => {
  const input = {
    amountKobo: 50_000,
    currency: 'NGN' as const,
    reference: 'payout-ref',
    accountNumber: '0123456789',
    bankCode: '058',
    reason: 'Mezzo seller payout',
  };

  function mockHappyPath(): void {
    fetchMock
      .mockResolvedValueOnce(okResponse({ status: true, data: { recipient_code: 'RCP_1' } }))
      .mockResolvedValueOnce(
        okResponse({ status: true, data: { transfer_code: 'TRF_1', reference: 'payout-ref' } }),
      );
  }

  it('registers the bank account as a recipient first', async () => {
    const provider = buildProvider();
    mockHappyPath();

    await provider.initiateTransfer(input);

    const [url, init] = callArgs(fetchMock)[0] as [string, { body: string }];
    expect(url).toBe(`${BASE_URL}/transferrecipient`);
    expect(JSON.parse(init.body)).toEqual({
      type: 'nuban',
      name: 'payout-ref',
      account_number: '0123456789',
      bank_code: '058',
      currency: 'NGN',
    });
  });

  it('transfers to the recipient code it just created', async () => {
    const provider = buildProvider();
    mockHappyPath();

    await provider.initiateTransfer(input);

    const [url, init] = callArgs(fetchMock)[1] as [string, { body: string }];
    expect(url).toBe(`${BASE_URL}/transfer`);
    expect(JSON.parse(init.body)).toEqual({
      source: 'balance',
      amount: 50_000,
      recipient: 'RCP_1',
      reference: 'payout-ref',
      reason: 'Mezzo seller payout',
    });
  });

  it('returns the transfer code for later reconciliation', async () => {
    const provider = buildProvider();
    mockHappyPath();

    await expect(provider.initiateTransfer(input)).resolves.toEqual({
      transferCode: 'TRF_1',
      reference: 'payout-ref',
    });
  });

  it('does not attempt the transfer when the recipient cannot be created', async () => {
    const provider = buildProvider();
    fetchMock.mockResolvedValueOnce(errorResponse());

    await expect(provider.initiateTransfer(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failure of the transfer itself', async () => {
    const provider = buildProvider();
    fetchMock
      .mockResolvedValueOnce(okResponse({ status: true, data: { recipient_code: 'RCP_1' } }))
      .mockResolvedValueOnce(errorResponse());

    await expect(provider.initiateTransfer(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
