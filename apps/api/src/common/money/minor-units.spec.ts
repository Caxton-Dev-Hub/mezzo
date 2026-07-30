import { majorToMinorUnits, minorToMajorUnits } from './minor-units';

describe('majorToMinorUnits', () => {
  it.each([
    ['0', 0],
    ['1', 100],
    ['1.5', 150],
    ['1.05', 105],
    ['15000.00', 1_500_000],
    ['70000.99', 7_000_099],
  ])('converts %s major units to %i minor units', (value, expected) => {
    expect(majorToMinorUnits(value)).toBe(expected);
  });

  it.each(['', '-1', '1.234', 'abc', '1,000', '1e3'])('rejects %s', (value) => {
    expect(majorToMinorUnits(value)).toBeNull();
  });
});

describe('minorToMajorUnits', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [150, '1.50'],
    [1_500_000, '15000.00'],
    [7_000_099, '70000.99'],
  ])('converts %i minor units to %s', (amount, expected) => {
    expect(minorToMajorUnits(amount)).toBe(expected);
  });

  it('round-trips through majorToMinorUnits', () => {
    for (const amount of [0, 1, 99, 100, 12_345, 999_999_999]) {
      expect(majorToMinorUnits(minorToMajorUnits(amount))).toBe(amount);
    }
  });
});
