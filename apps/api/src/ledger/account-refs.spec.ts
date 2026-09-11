import {
  escrowHoldingRef,
  parseAccountRef,
  platformFeeRevenueRef,
  providerClearingRef,
  treasuryRef,
  userWalletRef,
} from './account-refs';
import { LedgerAccountType } from './entities/ledger-account-type.enum';
import { EntryDirection } from './entities/entry-direction.enum';
import { UnknownLedgerAccountRefError } from './errors/unknown-ledger-account-ref.error';

describe('parseAccountRef', () => {
  it('resolves a user wallet ref to a credit-normal USER_WALLET account', () => {
    expect(parseAccountRef(userWalletRef('u1', 'NGN'))).toEqual({
      type: LedgerAccountType.USER_WALLET,
      normalBalance: EntryDirection.CREDIT,
    });
  });

  it('resolves an escrow holding ref to a credit-normal ESCROW_HOLDING account', () => {
    expect(parseAccountRef(escrowHoldingRef('e1'))).toEqual({
      type: LedgerAccountType.ESCROW_HOLDING,
      normalBalance: EntryDirection.CREDIT,
    });
  });

  it('resolves the platform fee revenue ref to a credit-normal account', () => {
    expect(parseAccountRef(platformFeeRevenueRef('NGN'))).toEqual({
      type: LedgerAccountType.PLATFORM_FEE_REVENUE,
      normalBalance: EntryDirection.CREDIT,
    });
  });

  it('resolves a provider clearing ref to a debit-normal PROVIDER_CLEARING account', () => {
    expect(parseAccountRef(providerClearingRef('paystack', 'NGN'))).toEqual({
      type: LedgerAccountType.PROVIDER_CLEARING,
      normalBalance: EntryDirection.DEBIT,
    });
  });

  it('resolves a treasury ref to a debit-normal TREASURY account', () => {
    expect(parseAccountRef(treasuryRef('NGN'))).toEqual({
      type: LedgerAccountType.TREASURY,
      normalBalance: EntryDirection.DEBIT,
    });
  });

  it('throws UnknownLedgerAccountRefError for a ref matching no chart-of-accounts pattern', () => {
    expect(() => parseAccountRef('not:a:real:ref')).toThrow(UnknownLedgerAccountRefError);
  });

  it('gives the same logical account a distinct ref per currency', () => {
    expect(userWalletRef('u1', 'NGN')).not.toBe(userWalletRef('u1', 'USD'));
    expect(platformFeeRevenueRef('NGN')).not.toBe(platformFeeRevenueRef('USD'));
    expect(providerClearingRef('paystack', 'NGN')).not.toBe(providerClearingRef('paystack', 'USD'));
    expect(treasuryRef('NGN')).not.toBe(treasuryRef('USD'));
  });

  it('resolves both currencies of a shared account to the same type and normal balance', () => {
    for (const currency of ['NGN', 'USD'] as const) {
      expect(parseAccountRef(platformFeeRevenueRef(currency))).toEqual({
        type: LedgerAccountType.PLATFORM_FEE_REVENUE,
        normalBalance: EntryDirection.CREDIT,
      });
      expect(parseAccountRef(userWalletRef('u1', currency))).toEqual({
        type: LedgerAccountType.USER_WALLET,
        normalBalance: EntryDirection.CREDIT,
      });
    }
  });

  it('rejects the old currency-less refs, so a stale ref cannot silently open an account', () => {
    for (const ref of [
      'user:u1:wallet',
      'platform:fee_revenue',
      'provider:paystack:clearing',
      'treasury:main',
    ]) {
      expect(() => parseAccountRef(ref)).toThrow(UnknownLedgerAccountRefError);
    }
  });

  it('rejects a ref carrying a currency the platform does not support', () => {
    expect(() => parseAccountRef('platform:fee_revenue:GBP')).toThrow(UnknownLedgerAccountRefError);
    expect(() => parseAccountRef('user:u1:wallet:XYZ')).toThrow(UnknownLedgerAccountRefError);
  });
});
