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
    expect(parseAccountRef(userWalletRef('u1'))).toEqual({
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
    expect(parseAccountRef(platformFeeRevenueRef())).toEqual({
      type: LedgerAccountType.PLATFORM_FEE_REVENUE,
      normalBalance: EntryDirection.CREDIT,
    });
  });

  it('resolves a provider clearing ref to a debit-normal PROVIDER_CLEARING account', () => {
    expect(parseAccountRef(providerClearingRef('paystack'))).toEqual({
      type: LedgerAccountType.PROVIDER_CLEARING,
      normalBalance: EntryDirection.DEBIT,
    });
  });

  it('resolves a treasury ref to a debit-normal TREASURY account', () => {
    expect(parseAccountRef(treasuryRef())).toEqual({
      type: LedgerAccountType.TREASURY,
      normalBalance: EntryDirection.DEBIT,
    });
  });

  it('throws UnknownLedgerAccountRefError for a ref matching no chart-of-accounts pattern', () => {
    expect(() => parseAccountRef('not:a:real:ref')).toThrow(UnknownLedgerAccountRefError);
  });
});
