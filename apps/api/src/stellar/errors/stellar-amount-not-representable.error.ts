import { DomainError } from '../../common/errors/domain-error';

export class StellarAmountNotRepresentableError extends DomainError {
  readonly code = 'STELLAR_AMOUNT_NOT_REPRESENTABLE';
  readonly statusCode = 422;

  constructor(amount: string) {
    super(`On-chain amount ${amount} is not a whole number of cents`, { amount });
  }
}
