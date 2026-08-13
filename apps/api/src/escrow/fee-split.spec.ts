import { computeFeeSplit } from './fee-split';
import { Money } from '../common/money/money';

describe('computeFeeSplit', () => {
  it('splits a round amount at a round rate', () => {
    const { feeAmount, netAmount } = computeFeeSplit(Money.of(100_000, 'NGN'), 250);

    expect(feeAmount.amount).toBe(2_500);
    expect(netAmount.amount).toBe(97_500);
  });

  it('always accounts for every minor unit of the gross', () => {
    const gross = Money.of(999_983, 'NGN');
    const { feeAmount, netAmount } = computeFeeSplit(gross, 317);

    expect(feeAmount.amount + netAmount.amount).toBe(gross.amount);
  });

  it('rounds the fee down so the platform never over-collects', () => {
    const { feeAmount, netAmount } = computeFeeSplit(Money.of(999, 'NGN'), 250);

    expect(feeAmount.amount).toBe(24);
    expect(netAmount.amount).toBe(975);
  });

  it('charges nothing at a zero rate', () => {
    const { feeAmount, netAmount } = computeFeeSplit(Money.of(100_000, 'NGN'), 0);

    expect(feeAmount.amount).toBe(0);
    expect(netAmount.amount).toBe(100_000);
  });

  it('takes the whole amount at a full ten thousand bps', () => {
    const { feeAmount, netAmount } = computeFeeSplit(Money.of(100_000, 'NGN'), 10_000);

    expect(feeAmount.amount).toBe(100_000);
    expect(netAmount.amount).toBe(0);
  });

  it('rounds a sub-unit fee down to zero', () => {
    const { feeAmount, netAmount } = computeFeeSplit(Money.of(10, 'NGN'), 1);

    expect(feeAmount.amount).toBe(0);
    expect(netAmount.amount).toBe(10);
  });

  it('keeps both sides in the currency of the gross', () => {
    const { feeAmount, netAmount } = computeFeeSplit(Money.of(100_000, 'USD'), 250);

    expect(feeAmount.currency).toBe('USD');
    expect(netAmount.currency).toBe('USD');
  });

  it('never produces a fractional minor unit', () => {
    for (const bps of [1, 37, 250, 999, 4_321]) {
      const { feeAmount, netAmount } = computeFeeSplit(Money.of(123_457, 'NGN'), bps);

      expect(Number.isInteger(feeAmount.amount)).toBe(true);
      expect(Number.isInteger(netAmount.amount)).toBe(true);
    }
  });
});
