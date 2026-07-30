const MAJOR_UNITS_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

export function majorToMinorUnits(value: string): number | null {
  const match = MAJOR_UNITS_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return Number(match[1]) * 100 + Number(fraction);
}

export function minorToMajorUnits(amount: number): string {
  const whole = Math.trunc(amount / 100);
  const fraction = Math.abs(amount % 100)
    .toString()
    .padStart(2, '0');
  return `${whole}.${fraction}`;
}
