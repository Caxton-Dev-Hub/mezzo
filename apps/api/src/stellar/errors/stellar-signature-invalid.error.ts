import { DomainError } from '../../common/errors/domain-error';

export class StellarSignatureInvalidError extends DomainError {
  readonly code = 'STELLAR_SIGNATURE_INVALID';
  readonly statusCode = 403;

  constructor(accountId: string) {
    super('That signature does not prove control of the Stellar account', { accountId });
  }
}
