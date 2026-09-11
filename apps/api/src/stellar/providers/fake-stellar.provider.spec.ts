import { ConfigService } from '@nestjs/config';
import { FakeStellarProvider } from './fake-stellar.provider';
import { StellarRailDisabledError } from '../errors/stellar-rail-disabled.error';
import { isStellarAccountId } from '../stellar-account-id';
import { escrowMemo } from '../escrow-memo';

const ESCROW_ID = '11111111-2222-3333-4444-555555555555';

function buildConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`Configuration key "${key}" does not exist`);
      }
      return value;
    },
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

const CONFIGURED = {
  STELLAR_NETWORK: 'testnet',
  STELLAR_ASSET_CODE: 'USDC',
  STELLAR_ASSET_ISSUER: 'GBDRKK7NTD4ZGLJQRXIYJEOKJUAHRLVYEEFP72E7XBWPCG7JMSAM3UQ2',
};

describe('FakeStellarProvider', () => {
  it('constructs with no asset issuer configured, so a disabled rail still lets the API boot', () => {
    expect(
      () =>
        new FakeStellarProvider(
          buildConfig({ ...CONFIGURED, STELLAR_ASSET_ISSUER: undefined }),
        ),
    ).not.toThrow();
  });

  it('refuses to hand out an asset it was never configured with', () => {
    const provider = new FakeStellarProvider(
      buildConfig({ ...CONFIGURED, STELLAR_ASSET_ISSUER: undefined }),
    );

    expect(() => provider.asset).toThrow(StellarRailDisabledError);
  });

  it('derives a valid, stable deposit address per escrow', async () => {
    const provider = new FakeStellarProvider(buildConfig(CONFIGURED));

    const first = await provider.openDepositAddress(ESCROW_ID);
    const second = await provider.openDepositAddress(ESCROW_ID);
    const other = await provider.openDepositAddress('99999999-2222-3333-4444-555555555555');

    expect(isStellarAccountId(first.accountId)).toBe(true);
    expect(first).toEqual(second);
    expect(first.accountId).not.toBe(other.accountId);
    expect(first.memo).toBe(escrowMemo(ESCROW_ID));
  });

  it('reads back a payment it minted, and nothing it did not', async () => {
    const provider = new FakeStellarProvider(buildConfig(CONFIGURED));
    const { accountId, memo } = await provider.openDepositAddress(ESCROW_ID);

    const payment = await provider.receivePayment({
      from: accountId,
      to: accountId,
      amount: '10.0000000',
      memo,
    });

    expect(await provider.findPayment(payment.transactionHash)).toEqual(payment);
    expect(await provider.findPayment('f'.repeat(64))).toBeNull();
  });

  it('forgets every payment on reset', async () => {
    const provider = new FakeStellarProvider(buildConfig(CONFIGURED));
    const { accountId, memo } = await provider.openDepositAddress(ESCROW_ID);
    const payment = await provider.receivePayment({
      from: accountId,
      to: accountId,
      amount: '1.0000000',
      memo,
    });

    provider.reset();

    expect(await provider.findPayment(payment.transactionHash)).toBeNull();
  });
});
