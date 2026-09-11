import { Money } from '../common/money/money';
import { UnsupportedStellarCurrencyError } from './errors/unsupported-stellar-currency.error';
import { StellarAmountNotRepresentableError } from './errors/stellar-amount-not-representable.error';

const STELLAR_DECIMALS = 7;

const USD_DECIMALS = 2;

const UNITS_PER_CENT = 10n ** BigInt(STELLAR_DECIMALS - USD_DECIMALS);

export function toStellarAmount(money: Money): string {
  if (money.currency !== 'USD') {
    throw new UnsupportedStellarCurrencyError(money.currency);
  }

  const units = BigInt(money.amount) * UNITS_PER_CENT;
  const whole = units / 10n ** BigInt(STELLAR_DECIMALS);
  const fraction = units % 10n ** BigInt(STELLAR_DECIMALS);

  return `${whole}.${fraction.toString().padStart(STELLAR_DECIMALS, '0')}`;
}

export function fromStellarAmount(amount: string): Money {
  const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(amount.trim());
  if (!match) {
    throw new StellarAmountNotRepresentableError(amount);
  }

  const [, whole, fraction = ''] = match;
  const units = BigInt(whole) * 10n ** BigInt(STELLAR_DECIMALS) + BigInt(fraction.padEnd(STELLAR_DECIMALS, '0'));

  if (units % UNITS_PER_CENT !== 0n) {
    throw new StellarAmountNotRepresentableError(amount);
  }

  return Money.of(Number(units / UNITS_PER_CENT), 'USD');
}
