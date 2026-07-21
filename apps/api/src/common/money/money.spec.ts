import { Money } from './money';
import { InvalidMoneyAmountError } from './errors/invalid-money-amount.error';
import { CurrencyMismatchError } from './errors/currency-mismatch.error';

describe('Money', () => {
  it('rejects non-integer amounts', () => {
    expect(() => Money.of(100.5, 'NGN')).toThrow(InvalidMoneyAmountError);
  });

  it('rejects negative amounts', () => {
    expect(() => Money.of(-1, 'NGN')).toThrow(InvalidMoneyAmountError);
  });

  it('rejects mixed-currency arithmetic', () => {
    const ngn = Money.of(1000, 'NGN');
    const usd = Money.of(1000, 'USD');
    expect(() => ngn.add(usd)).toThrow(CurrencyMismatchError);
    expect(() => ngn.greaterThan(usd)).toThrow(CurrencyMismatchError);
  });

  it('serializes as { amount, currency }', () => {
    expect(Money.of(50_000_000, 'NGN').toJSON()).toEqual({ amount: 50_000_000, currency: 'NGN' });
  });

  it('adds and subtracts same-currency amounts', () => {
    const a = Money.of(300, 'NGN');
    const b = Money.of(100, 'NGN');
    expect(a.add(b).amount).toBe(400);
    expect(a.subtract(b).amount).toBe(200);
  });

  it('rejects a subtraction that would go negative', () => {
    const a = Money.of(100, 'NGN');
    const b = Money.of(300, 'NGN');
    expect(() => a.subtract(b)).toThrow(InvalidMoneyAmountError);
  });

  it('compares amounts correctly', () => {
    const bigger = Money.of(500, 'NGN');
    const smaller = Money.of(100, 'NGN');
    expect(bigger.greaterThan(smaller)).toBe(true);
    expect(smaller.greaterThan(bigger)).toBe(false);
    expect(bigger.greaterThanOrEqual(bigger)).toBe(true);
    expect(smaller.lessThan(bigger)).toBe(true);
    expect(Money.of(100, 'NGN').equals(Money.of(100, 'NGN'))).toBe(true);
  });
});
