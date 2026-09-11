import { Money } from '../common/money/money';
import { fromStellarAmount, toStellarAmount } from './stellar-amount';
import { UnsupportedStellarCurrencyError } from './errors/unsupported-stellar-currency.error';
import { StellarAmountNotRepresentableError } from './errors/stellar-amount-not-representable.error';

describe('stellar amounts', () => {
  it('renders cents at the seven decimal places Stellar assets use', () => {
    expect(toStellarAmount(Money.of(1234, 'USD'))).toBe('12.3400000');
    expect(toStellarAmount(Money.of(0, 'USD'))).toBe('0.0000000');
    expect(toStellarAmount(Money.of(1, 'USD'))).toBe('0.0100000');
  });

  it('refuses to put a naira amount on the Stellar rail', () => {
    expect(() => toStellarAmount(Money.of(1234, 'NGN'))).toThrow(UnsupportedStellarCurrencyError);
  });

  it('round-trips through the on-chain representation without losing a cent', () => {
    for (const cents of [0, 1, 99, 100, 7_500, 123_456_789]) {
      expect(fromStellarAmount(toStellarAmount(Money.of(cents, 'USD')))).toEqual(
        Money.of(cents, 'USD'),
      );
    }
  });

  it('accepts an on-chain amount written with fewer decimal places', () => {
    expect(fromStellarAmount('12.34')).toEqual(Money.of(1234, 'USD'));
    expect(fromStellarAmount('12')).toEqual(Money.of(1200, 'USD'));
  });

  it('rejects an on-chain amount finer than a cent', () => {
    expect(() => fromStellarAmount('12.345')).toThrow(StellarAmountNotRepresentableError);
    expect(() => fromStellarAmount('0.0000001')).toThrow(StellarAmountNotRepresentableError);
  });

  it('rejects anything that is not a positive decimal', () => {
    for (const value of ['', '-1.00', 'abc', '1.00000000', '1e5']) {
      expect(() => fromStellarAmount(value)).toThrow(StellarAmountNotRepresentableError);
    }
  });
});
