import { DomainError } from '../../common/errors/domain-error';
import { Currency } from '../../common/money/currency';

export class UnsupportedStellarCurrencyError extends DomainError {
  readonly code = 'UNSUPPORTED_STELLAR_CURRENCY';
  readonly statusCode = 422;

  constructor(currency: Currency) {
    super(`The Stellar rail settles in USD only, not ${currency}`, { currency });
  }
}
