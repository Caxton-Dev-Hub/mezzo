import { DomainError } from '../../common/errors/domain-error';

export class StellarAccountNotLinkedError extends DomainError {
  readonly code = 'STELLAR_ACCOUNT_NOT_LINKED';
  readonly statusCode = 409;

  constructor(userId: string) {
    super('That party has not linked a Stellar wallet', { userId });
  }
}
