import { DomainError } from '../../common/errors/domain-error';

export class InvalidStellarAccountError extends DomainError {
  readonly code = 'INVALID_STELLAR_ACCOUNT';
  readonly statusCode = 400;

  constructor(accountId: string) {
    super('That is not a valid Stellar account id', { accountId });
  }
}
