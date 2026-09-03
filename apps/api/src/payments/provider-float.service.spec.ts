import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { LedgerService } from '../ledger/ledger.service';
import { providerClearingRef } from '../ledger/account-refs';
import { ProviderFloatService } from './provider-float.service';
import { FakePaystackProvider } from './providers/fake-paystack.provider';
import { FlutterwaveHttpProvider } from './providers/flutterwave-http.provider';
import { PaystackHttpProvider } from './providers/paystack-http.provider';

interface Harness {
  service: ProviderFloatService;
  fakeProvider: FakePaystackProvider;
  paystackGetBalance: jest.Mock;
  flutterwaveGetBalance: jest.Mock;
}

function buildHarness(
  env: Record<string, string | undefined>,
  clearing: Record<string, number>,
): Harness {
  const configService = {
    get: jest.fn().mockImplementation((key: string) => env[key]),
  } as unknown as ConfigService;

  const ledgerService = {
    getBalanceOrZero: jest
      .fn()
      .mockImplementation((ref: string, currency: string) =>
        Promise.resolve({ amount: clearing[ref] ?? 0, currency }),
      ),
  } as unknown as LedgerService;

  const fakeProvider = new FakePaystackProvider();
  const paystackGetBalance = jest.fn();
  const flutterwaveGetBalance = jest.fn();
  const paystackProvider = {
    name: 'paystack',
    getBalance: paystackGetBalance,
  } as unknown as PaystackHttpProvider;
  const flutterwaveProvider = {
    name: 'flutterwave',
    getBalance: flutterwaveGetBalance,
  } as unknown as FlutterwaveHttpProvider;

  const service = new ProviderFloatService(
    configService,
    ledgerService,
    fakeProvider,
    paystackProvider,
    flutterwaveProvider,
  );

  return { service, fakeProvider, paystackGetBalance, flutterwaveGetBalance };
}

const LIVE_ENV = {
  PAYMENT_PROVIDER: 'paystack',
  PAYSTACK_SECRET_KEY: 'sk_test_123',
  FLUTTERWAVE_SECRET_KEY: 'FLWSECK_TEST-abc',
};

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ProviderFloatService', () => {
  it('reports both providers even though only one processes payments', async () => {
    const harness = buildHarness(LIVE_ENV, {
      [providerClearingRef('paystack')]: 4_230_000,
      [providerClearingRef('flutterwave')]: 915_000,
    });
    harness.paystackGetBalance.mockResolvedValue({ amountKobo: 4_230_000, currency: 'NGN' });
    harness.flutterwaveGetBalance.mockResolvedValue({ amountKobo: 915_000, currency: 'NGN' });

    const report = await harness.service.report();

    expect(report.map((entry) => entry.provider)).toEqual(['paystack', 'flutterwave']);
    expect(report.every((entry) => entry.status === 'BALANCED')).toBe(true);
  });

  it('reports a shortfall when the live float is below the clearing account', async () => {
    const harness = buildHarness(LIVE_ENV, {
      [providerClearingRef('flutterwave')]: 915_000,
    });
    harness.paystackGetBalance.mockResolvedValue({ amountKobo: 0, currency: 'NGN' });
    harness.flutterwaveGetBalance.mockResolvedValue({ amountKobo: 910_000, currency: 'NGN' });

    const report = await harness.service.report();
    const flutterwave = report.find((entry) => entry.provider === 'flutterwave');

    expect(flutterwave).toEqual({
      provider: 'flutterwave',
      status: 'SHORTFALL',
      clearing: { amount: 915_000, currency: 'NGN' },
      live: { amount: 910_000, currency: 'NGN' },
      drift: { amount: 5_000, currency: 'NGN' },
    });
  });

  it('reports a surplus when the live float exceeds the clearing account', async () => {
    const harness = buildHarness(LIVE_ENV, {
      [providerClearingRef('paystack')]: 100_000,
    });
    harness.paystackGetBalance.mockResolvedValue({ amountKobo: 130_000, currency: 'NGN' });
    harness.flutterwaveGetBalance.mockResolvedValue({ amountKobo: 0, currency: 'NGN' });

    const report = await harness.service.report();
    const paystack = report.find((entry) => entry.provider === 'paystack');

    expect(paystack).toMatchObject({
      status: 'SURPLUS',
      drift: { amount: 30_000, currency: 'NGN' },
    });
  });

  it('keeps reporting the clearing balance when a provider is unreachable', async () => {
    const harness = buildHarness(LIVE_ENV, {
      [providerClearingRef('paystack')]: 4_230_000,
    });
    harness.paystackGetBalance.mockRejectedValue(
      new ServiceUnavailableException('Paystack balance retrieval failed'),
    );
    harness.flutterwaveGetBalance.mockResolvedValue({ amountKobo: 0, currency: 'NGN' });

    const report = await harness.service.report();
    const paystack = report.find((entry) => entry.provider === 'paystack');

    expect(paystack).toEqual({
      provider: 'paystack',
      status: 'UNAVAILABLE',
      clearing: { amount: 4_230_000, currency: 'NGN' },
      live: null,
      drift: null,
    });
  });

  it('never calls a provider whose secret key is absent', async () => {
    const harness = buildHarness(
      { PAYMENT_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_test_123' },
      { [providerClearingRef('flutterwave')]: 42 },
    );
    harness.paystackGetBalance.mockResolvedValue({ amountKobo: 0, currency: 'NGN' });

    const report = await harness.service.report();

    expect(harness.flutterwaveGetBalance).not.toHaveBeenCalled();
    expect(report.find((entry) => entry.provider === 'flutterwave')).toEqual({
      provider: 'flutterwave',
      status: 'UNCONFIGURED',
      clearing: { amount: 42, currency: 'NGN' },
      live: null,
      drift: null,
    });
  });

  it('treats a blank secret key as unconfigured', async () => {
    const harness = buildHarness(
      {
        PAYMENT_PROVIDER: 'paystack',
        PAYSTACK_SECRET_KEY: 'sk_test_123',
        FLUTTERWAVE_SECRET_KEY: '',
      },
      {},
    );
    harness.paystackGetBalance.mockResolvedValue({ amountKobo: 0, currency: 'NGN' });

    const report = await harness.service.report();

    expect(harness.flutterwaveGetBalance).not.toHaveBeenCalled();
    expect(report.find((entry) => entry.provider === 'flutterwave')?.status).toBe('UNCONFIGURED');
  });

  it('reads the fake provider instead of the live ones when running in fake mode', async () => {
    const harness = buildHarness(
      { PAYMENT_PROVIDER: 'fake', PAYSTACK_SECRET_KEY: 'sk_test_123' },
      { [providerClearingRef('paystack')]: 700_00 },
    );
    harness.fakeProvider.seedBalance(700_00);

    const report = await harness.service.report();

    expect(harness.paystackGetBalance).not.toHaveBeenCalled();
    expect(report.find((entry) => entry.provider === 'paystack')).toMatchObject({
      status: 'BALANCED',
      live: { amount: 70_000, currency: 'NGN' },
    });
  });
});
