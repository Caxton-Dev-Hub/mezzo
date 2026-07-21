import { DomainError } from '../../errors/domain-error';
import { Currency } from '../currency';

export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';
  readonly statusCode = 400;

  constructor(a: Currency, b: Currency) {
    super(`Cannot operate on mismatched currencies: ${a} and ${b}`);
  }
}
