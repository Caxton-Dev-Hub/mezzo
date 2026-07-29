const MAJOR_UNIT_PATTERN = /^\d+(\.\d{1,2})?$/;

export function majorToMinorUnits(input: string): number | null {
  const trimmed = input.trim();
  if (!MAJOR_UNIT_PATTERN.test(trimmed)) {
    return null;
  }

  const [whole, fraction = ''] = trimmed.split('.');
  const paddedFraction = (fraction + '00').slice(0, 2);
  const minorUnits = Number(`${whole}${paddedFraction}`);

  return Number.isSafeInteger(minorUnits) ? minorUnits : null;
}

export function minorToMajorUnitsString(minorUnits: number): string {
  const whole = Math.floor(minorUnits / 100);
  const fraction = Math.abs(minorUnits % 100)
    .toString()
    .padStart(2, '0');
  return `${whole}.${fraction}`;
}

export function formatMoney(minorUnits: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  });
  return formatter.format(minorUnits / 100);
}
