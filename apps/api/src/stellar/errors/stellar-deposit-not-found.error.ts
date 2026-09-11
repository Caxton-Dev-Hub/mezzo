import { DomainError } from '../../common/errors/domain-error';

export class StellarDepositNotFoundError extends DomainError {
  readonly code = 'STELLAR_DEPOSIT_NOT_FOUND';
  readonly statusCode = 404;

  constructor(transactionHash: string) {
    super('No such payment exists on the Stellar network', { transactionHash });
  }
}
