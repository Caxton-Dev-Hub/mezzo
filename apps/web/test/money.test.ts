import { describe, expect, it } from 'vitest';
import { majorToMinorUnits, minorToMajorUnitsString, formatMoney } from '../lib/money';

describe('majorToMinorUnits', () => {
  it('converts a whole naira amount to kobo', () => {
    expect(majorToMinorUnits('15000')).toBe(1_500_000);
  });

  it('converts a decimal naira amount to kobo without float drift', () => {
    expect(majorToMinorUnits('19.99')).toBe(1999);
    expect(majorToMinorUnits('0.1')).toBe(10);
  });

  it('rejects malformed input', () => {
    expect(majorToMinorUnits('abc')).toBeNull();
    expect(majorToMinorUnits('12.999')).toBeNull();
    expect(majorToMinorUnits('-5')).toBeNull();
    expect(majorToMinorUnits('')).toBeNull();
  });
});

describe('minorToMajorUnitsString', () => {
  it('round-trips with majorToMinorUnits', () => {
    expect(minorToMajorUnitsString(1_500_000)).toBe('15000.00');
    expect(minorToMajorUnitsString(1999)).toBe('19.99');
    expect(minorToMajorUnitsString(5)).toBe('0.05');
  });
});

describe('formatMoney', () => {
  it('formats kobo as a currency string', () => {
    expect(formatMoney(1_500_000, 'NGN')).toContain('15,000');
  });
});
