import { DomainError } from '../../common/errors/domain-error';

export class PayoutAccountNotConfiguredError extends DomainError {
  readonly code = 'PAYOUT_ACCOUNT_NOT_CONFIGURED';
  readonly statusCode = 422;

  constructor() {
    super('Add a payout account before requesting a withdrawal');
  }
}
